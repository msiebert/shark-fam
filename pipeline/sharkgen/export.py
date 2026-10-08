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
    body.data.materials.append(_skin_material(tex, model.get("tiles", (TILES_AROUND, TILES_ALONG))))

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


# ------------------------------------------------------------------ diver (jointed, multi-material)
_DIVER_MATS = {
    # name: (roughness, metallic, vertex colours?, base colour if not)
    "Suit": (0.72, 0.0, True, None),
    "Gear": (0.42, 0.1, True, None),
    "Tank": (0.34, 0.35, True, None),
    "Metal": (0.28, 0.9, True, None),
    "Glass": (0.08, 0.0, True, None),
}


def export_diver_glb(parts, path):
    """Write the diver hierarchy: one node per Part, each with a multi-material mesh and a pivot at its joint."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for name, (rough, metal, _, _) in _DIVER_MATS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        mats[name] = m
    objs = {}
    for name, part in parts.items():
        subs = part.subs
        verts, faces, cols, midx, order = [], [], [], [], list(mats)
        off = 0
        for v, f, c, mname in subs:
            verts.append(v - part.pivot)
            cols.append(c)
            faces += [tuple(i + off for i in q) for q in f]
            midx += [order.index(mname)] * len(f)
            off += len(v)
        verts, cols = np.vstack(verts), np.vstack(cols)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts.tolist(), [], [list(q) for q in faces])
        mesh.update()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.polygons.foreach_set("material_index", midx)
        for mn in order:
            mesh.materials.append(mats[mn])
        ca = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        ca.data.foreach_set("color", np.concatenate([cols, np.ones((len(cols), 1))], 1).astype(np.float32).ravel())
        o = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(o)
        objs[name] = o
    for name, part in parts.items():
        o = objs[name]
        if part.parent:
            o.parent = objs[part.parent]
            o.location = _to_blender(part.pivot - parts[part.parent].pivot)
        else:
            o.location = _to_blender(part.pivot)
    bpy.context.view_layer.update()
    # Vertices were authored in the app's Y-up space; hand them to Blender as Z-up so the exporter's Y-up conversion is a no-op.
    for o in objs.values():
        for v in o.data.vertices:
            v.co = _to_blender(np.array(v.co))
    kw = dict(filepath=str(path), export_format="GLB", export_yup=True, export_materials="EXPORT",
              export_normals=True, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "MATERIAL"
    bpy.ops.export_scene.gltf(**kw)


def _to_blender(p):
    """glTF/three Y-up (x, y, z) -> Blender Z-up (x, -z, y); the exporter maps it straight back."""
    return (float(p[0]), float(-p[2]), float(p[1]))
