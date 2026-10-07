"""Blender (bpy) export: numpy geometry + painted textures -> GLB with PBR materials."""
import numpy as np
import bpy
from .util import hex_to_linear

TILES_AROUND, TILES_ALONG = 10, 16   # micro-detail tiling on the body (~0.25 m per tile)


def _mesh_obj(name, verts, faces, uv=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts.tolist(), [], [list(f) for f in faces])
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    if uv is not None:
        layer = mesh.uv_layers.new(name="UVMap")
        idx = np.empty(len(mesh.loops), np.int32)
        mesh.loops.foreach_get("vertex_index", idx)
        layer.data.foreach_set("uv", np.asarray(uv, np.float32)[idx].ravel())
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _image(path, noncolor=False):
    img = bpy.data.images.load(str(path))
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    return img


def _tex(nt, img, uv, scale=None):
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    node.interpolation = "Linear"
    node.extension = "REPEAT"
    src = uv.outputs["UV"]
    if scale:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale[0], scale[1], 1.0)
        nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
        src = mp.outputs["Vector"]
    nt.links.new(src, node.inputs["Vector"])
    return node


def _skin_material(tex, scale, vertex_color=False):
    mat = bpy.data.materials.new("Fin" if vertex_color else "Skin")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    if vertex_color:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        alb = _tex(nt, _image(tex["albedo"]), uv)
        nt.links.new(alb.outputs["Color"], bsdf.inputs["Base Color"])
    rough = _tex(nt, _image(tex["rough"], True), uv, scale)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(rough.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nrm = _tex(nt, _image(tex["normal"], True), uv, scale)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.6
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Coat Weight"].default_value = 0.12
    bsdf.inputs["Coat Roughness"].default_value = 0.15
    return mat


def export_glb(model, cfg, path, tex):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    nm = cfg["name"].replace(" ", "")

    bv, bf, buv = model["body"]
    body = _mesh_obj(nm + "_Body", bv, bf, buv)
    body.data.materials.append(_skin_material(tex, (TILES_AROUND, TILES_ALONG)))

    fv, ff, fc, fuv = model["fins"]
    fins = _mesh_obj(nm + "_Fins", fv, ff, fuv)
    ca = fins.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", np.concatenate([fc, np.ones((len(fc), 1))], 1).astype(np.float32).ravel())
    fins.data.materials.append(_skin_material(tex, (1.0, 1.0), vertex_color=True))

    ev, ef = model["eye"]
    if len(ev):
        eyes = _mesh_obj(nm + "_Eyes", ev, ef)
        em = bpy.data.materials.new("Eye")
        em.use_nodes = True
        eb = em.node_tree.nodes["Principled BSDF"]
        eb.inputs["Base Color"].default_value = (*hex_to_linear("#050709"), 1)
        eb.inputs["Roughness"].default_value = 0.5
        eb.inputs["Specular IOR Level"].default_value = 0.25
        eyes.data.materials.append(em)

    kw = dict(filepath=str(path), export_format="GLB", export_yup=True,
              export_materials="EXPORT", export_normals=True,
              export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "MATERIAL"
    if "export_image_format" in props:
        kw["export_image_format"] = "JPEG"
    if "export_jpeg_quality" in props:
        kw["export_jpeg_quality"] = 92
    bpy.ops.export_scene.gltf(**kw)
