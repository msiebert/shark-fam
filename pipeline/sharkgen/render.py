"""Studio render rig (Cycles CPU): hero shot + flat silhouette views."""
import math
import bpy
from mathutils import Vector
from .util import hex_to_linear


def _reset_and_import(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return meshes, lo, hi


def _look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def _area(name, loc, target, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.size, ld.energy, ld.color = size, energy, color
    o = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    _look_at(o, target)
    return o


def _world_gradient(top, bottom, ambient, ambient_strength):
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    n = nt.nodes
    tc = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*bottom, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*top, 1)
    bg_cam = n.new("ShaderNodeBackground")
    bg_amb = n.new("ShaderNodeBackground")
    bg_amb.inputs["Color"].default_value = (*ambient, 1)
    bg_amb.inputs["Strength"].default_value = ambient_strength
    lp = n.new("ShaderNodeLightPath")
    mixs = n.new("ShaderNodeMixShader")
    out = n.new("ShaderNodeOutputWorld")
    L = nt.links
    L.new(tc.outputs["Window"], sep.inputs["Vector"])
    L.new(sep.outputs["Y"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bg_cam.inputs["Color"])
    L.new(lp.outputs["Is Camera Ray"], mixs.inputs["Fac"])
    L.new(bg_amb.outputs["Background"], mixs.inputs[1])
    L.new(bg_cam.outputs["Background"], mixs.inputs[2])
    L.new(mixs.outputs["Shader"], out.inputs["Surface"])


def _scene_common(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    return sc


def render_hero(glb, out_png, res=(1600, 900), samples=64, yaw=0.0, cam_z=-0.07):
    meshes, lo, hi = _reset_and_import(glb)
    sc = _scene_common(res, samples)
    c = (lo + hi) / 2
    L = hi.x - lo.x
    # sleek, near-matte wet skin
    _world_gradient(top=hex_to_linear("#1F3446"), bottom=hex_to_linear("#0A141C"),
                    ambient=hex_to_linear("#2A4A63"), ambient_strength=0.3)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens, cam_d.sensor_width = 70, 36
    cam = bpy.data.objects.new("Cam", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    a = math.radians(-62 + yaw)  # side-three-quarter, nose toward right of frame
    dist = L * 2.3
    cam.location = c + Vector((math.cos(a) * dist, math.sin(a) * dist, cam_z * L))
    _look_at(cam, c + Vector((L * 0.04, 0, L * 0.01)))
    _area("Key", c + Vector((L * 0.35, -L * 0.9, L * 1.0)), c, L * 1.2, L ** 2 * 48, (1.0, 0.97, 0.92))
    _area("Rim", c + Vector((-L * 0.9, L * 0.9, L * 0.55)), c, L * 0.8, L ** 2 * 55, (0.55, 0.78, 1.0))
    _area("Fill", c + Vector((L * 0.9, -L * 0.7, -L * 0.3)), c, L * 1.5, L ** 2 * 7, (0.7, 0.85, 1.0))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def render_silhouette(glb, out_png, view="side", res=(1600, 700), samples=4):
    meshes, lo, hi = _reset_and_import(glb)
    sc = _scene_common(res, samples)
    sc.cycles.use_denoising = False
    c = (lo + hi) / 2
    L = hi.x - lo.x
    w = bpy.data.worlds.new("White")
    sc.world = w
    w.use_nodes = True
    bgn = w.node_tree.nodes["Background"]
    bgn.inputs["Color"].default_value = (1, 1, 1, 1)
    bgn.inputs["Strength"].default_value = 1.0
    sc.view_settings.view_transform = "Standard"
    m = bpy.data.materials.new("Black")
    m.use_nodes = True
    m.node_tree.nodes.clear()
    em = m.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0, 0, 0, 1)
    o = m.node_tree.nodes.new("ShaderNodeOutputMaterial")
    m.node_tree.links.new(em.outputs["Emission"], o.inputs["Surface"])
    bpy.context.view_layer.material_override = m
    cd = bpy.data.cameras.new("Ortho")
    cd.type = "ORTHO"
    cd.ortho_scale = L * 1.15
    cam = bpy.data.objects.new("Ortho", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    if view == "side":
        cam.location = c + Vector((0, -L * 3, 0))
    else:
        cam.location = c + Vector((0, 0, L * 3))
    _look_at(cam, c)
    if view == "top":
        cam.rotation_euler = (0, 0, 0)
    sc.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def render_closeup(glb, out_png, res=(1400, 900), samples=64, focus=0.11, yaw=-48.0, dist_frac=0.42, lift=0.0, cam_z=-0.01):
    """Close-up of the head (focus = fraction of length back from the nose)."""
    meshes, lo, hi = _reset_and_import(glb)
    sc = _scene_common(res, samples)
    L = hi.x - lo.x
    target = Vector((hi.x - focus * L, 0, lo.z * 0 + (-0.01 + lift) * L))
    _world_gradient(top=hex_to_linear("#1F3446"), bottom=hex_to_linear("#0A141C"),
                    ambient=hex_to_linear("#2A4A63"), ambient_strength=0.3)
    cd = bpy.data.cameras.new("Cam")
    cd.lens, cd.sensor_width = 85, 36
    cam = bpy.data.objects.new("Cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    a = math.radians(yaw)
    d = L * dist_frac
    cam.location = target + Vector((math.cos(a) * d, math.sin(a) * d, cam_z * L))
    _look_at(cam, target)
    _area("Key", target + Vector((L * 0.2, -L * 0.45, L * 0.5)), target, L * 0.7, L ** 2 * 14, (1.0, 0.97, 0.92))
    _area("Rim", target + Vector((-L * 0.4, L * 0.5, L * 0.3)), target, L * 0.5, L ** 2 * 14, (0.55, 0.78, 1.0))
    _area("Fill", target + Vector((L * 0.4, -L * 0.3, -L * 0.2)), target, L * 0.8, L ** 2 * 2.5, (0.7, 0.85, 1.0))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
