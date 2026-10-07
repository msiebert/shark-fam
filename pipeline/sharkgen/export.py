"""Blender (bpy) export: numpy geometry -> GLB with PBR skin + eye materials."""
import numpy as np
import bpy
from .util import hex_to_linear


def _mesh_obj(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts.tolist(), [], [list(f) for f in faces])
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _principled(mat):
    mat.use_nodes = True
    return mat.node_tree.nodes["Principled BSDF"]


def export_glb(model, cfg, path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sv, sf, sc = model["skin"]
    skin = _mesh_obj(cfg["name"].replace(" ", "") + "_Skin", sv, sf)
    ca = skin.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([sc, np.ones((len(sc), 1))], 1).astype(np.float32)
    ca.data.foreach_set("color", rgba.ravel())

    mat = bpy.data.materials.new("Skin")
    bsdf = _principled(mat)
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Coat Weight"].default_value = 0.15
    bsdf.inputs["Coat Roughness"].default_value = 0.12
    skin.data.materials.append(mat)

    ev, ef = model["eye"]
    if len(ev):
        eyes = _mesh_obj(cfg["name"].replace(" ", "") + "_Eyes", ev, ef)
        em = bpy.data.materials.new("Eye")
        eb = _principled(em)
        eb.inputs["Base Color"].default_value = (*hex_to_linear("#06090B"), 1)
        eb.inputs["Roughness"].default_value = 0.12
        eyes.data.materials.append(em)

    kw = dict(filepath=str(path), export_format="GLB", export_yup=True,
              export_materials="EXPORT", export_normals=True,
              export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "MATERIAL"
    bpy.ops.export_scene.gltf(**kw)
