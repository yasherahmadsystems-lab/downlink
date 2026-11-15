# Shared helpers for the asset build scripts.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# Conventions (docs/PLAN.md §3):
#   1 Blender unit = 10 cm. Blender is Z-up; the glTF exporter converts to +Y up.
#   A part's origin is its attach point. Attachable parts are modelled with the
#   attach plane on local XY and "outward" along local +Z, so the game can parent
#   a part to a SOCKET_* node with an identity transform.
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'src', 'assets', 'models')
PREVIEWS = os.path.join(ROOT, 'art', 'previews')
TEX = os.path.join(ROOT, 'art', 'textures')
for d in (MODELS, PREVIEWS, TEX):
    os.makedirs(d, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- materials

def material(name, color, metallic=0.0, roughness=0.5, emission=None, coat=0.0):
    """Plain PBR material. `color` is linear RGB."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1.0)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.05
    if emission:
        p.inputs['Emission Color'].default_value = (*emission[0], 1.0)
        p.inputs['Emission Strength'].default_value = emission[1]
    return m


def save_image(name, arr, colorspace='sRGB'):
    """arr: float array (h, w, 3) in 0..1, row 0 at the top. Saves a PNG and returns the image."""
    h, w, _ = arr.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr[::-1]  # Blender stores rows bottom-up
    img = bpy.data.images.new(name, w, h, alpha=False)
    # Write display values straight into the buffer: treat it as non-colour while filling.
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    img.colorspace_settings.name = colorspace
    return img


def textured_material(name, albedo, orm=None, normal=None, roughness=0.5, metallic=0.0, normal_strength=1.0):
    """PBR material from images. `orm` packs roughness in G and metallic in B (glTF layout)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = albedo
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if orm is not None:
        o = nt.nodes.new('ShaderNodeTexImage')
        o.image = orm
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], p.inputs['Metallic'])
    if normal is not None:
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return m


def height_to_normal(height, strength=2.0):
    """Tangent-space normal map (OpenGL convention) from a height field, row 0 at the top."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(height)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def blur(a, r):
    for axis in (0, 1):
        acc = np.zeros_like(a)
        for k in range(-r, r + 1):
            acc += np.roll(a, k, axis=axis)
        a = acc / (2 * r + 1)
    return a


# ---------------------------------------------------------------- geometry

class Builder:
    """Accumulates primitives into one mesh with several material slots."""

    def __init__(self, name, mats):
        self.name = name
        self.mats = list(mats)
        self.bm = bmesh.new()
        self.bm.loops.layers.uv.new('UVMap')

    def _slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _emit(self, tb, mat, loc, rot):
        idx = self._slot(mat)
        for f in tb.faces:
            f.material_index = idx
            f.smooth = True
        m = Matrix.Translation(Vector(loc))
        if rot is not None:
            m = m @ rot.to_4x4()
        tb.transform(m)
        tmp = bpy.data.meshes.new('tmp')
        tb.to_mesh(tmp)
        tb.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    def box(self, size, loc, mat, bevel=0.0, rot=None, segments=1):
        tb = bmesh.new()
        tb.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cube(tb, size=1.0)
        bmesh.ops.scale(tb, vec=Vector(size), verts=tb.verts[:])
        if bevel > 0:
            bmesh.ops.bevel(tb, geom=tb.edges[:], offset=bevel, offset_type='OFFSET',
                            segments=segments, profile=0.5, affect='EDGES')
        self._emit(tb, mat, loc, rot)

    def cyl(self, radius, depth, loc, mat, segments=24, rot=None, radius2=None, bevel=0.0):
        tb = bmesh.new()
        tb.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cone(tb, cap_ends=True, cap_tris=False, segments=segments,
                              radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
        if bevel > 0:
            rim = [e for e in tb.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
            bmesh.ops.bevel(tb, geom=rim, offset=bevel, offset_type='OFFSET', segments=2, profile=0.5, affect='EDGES')
        self._emit(tb, mat, loc, rot)

    def quad(self, w, h, loc, mat, rot=None, uv=(0, 0, 1, 1)):
        """Flat rectangle on local XY facing +Z, with UVs. Use for textured faces."""
        tb = bmesh.new()
        layer = tb.loops.layers.uv.new('UVMap')
        u0, v0, u1, v1 = uv
        pts = [(-w / 2, -h / 2, u0, v0), (w / 2, -h / 2, u1, v0), (w / 2, h / 2, u1, v1), (-w / 2, h / 2, u0, v1)]
        vs = [tb.verts.new((x, y, 0)) for x, y, _, _ in pts]
        f = tb.faces.new(vs)
        for loop, (_, _, u, v) in zip(f.loops, pts):
            loop[layer].uv = (u, v)
        self._emit(tb, mat, loc, rot)

    def finish(self, parent=None, loc=(0, 0, 0)):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        me.set_sharp_from_angle(angle=math.radians(38))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        if parent is not None:
            ob.parent = parent
        return ob


def empty(name, loc=(0, 0, 0), rot=None, parent=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    if rot is not None:
        e.rotation_euler = rot.to_euler() if hasattr(rot, 'to_euler') else rot
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


def basis(x, y, z):
    """Rotation matrix whose columns are the given local axes (in parent space)."""
    return Matrix((Vector(x), Vector(y), Vector(z))).transposed()


def hierarchy(root):
    out = [root]
    for c in root.children:
        out += hierarchy(c)
    return out


def tri_count(root):
    n = 0
    for o in hierarchy(root):
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


# ---------------------------------------------------------------- export + preview

def export_glb(root, filename, release_names=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in hierarchy(root):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(MODELS, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_animations=False,
                              export_extras=True, export_image_format='AUTO')
    print(f'EXPORTED {filename}  tris={tri_count(root)}  kB={os.path.getsize(path) // 1024}')
    if release_names:
        # Blender object names are unique per file. Free this part's socket and hinge
        # names so the next part built in the same session exports them unsuffixed.
        for o in hierarchy(root)[1:]:
            o.name = f'{root.name}/{o.name}'


def studio(samples=48, res=(1400, 1050)):
    """Neutral cleanroom-style studio for preview renders (Cycles, CPU)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.max_bounces = 6
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'

    w = bpy.data.worlds.new('Studio')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.54, 0.52, 1)
    bg.inputs['Strength'].default_value = 0.35
    sc.world = w

    fb = Builder('Floor', [material('StudioFloor', (0.40, 0.39, 0.37), 0.0, 0.32)])
    fb.quad(120, 120, (0, 0, 0), fb.mats[0])
    fb.finish()

    def softbox(name, loc, size, power, target=(0, 0, 1.5)):
        l = bpy.data.lights.new(name, 'AREA')
        l.shape = 'RECTANGLE'
        l.size, l.size_y = size
        l.energy = power
        l.color = (1.0, 0.97, 0.93)
        o = bpy.data.objects.new(name, l)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(o)

    softbox('Key', (5.5, -6.0, 8.0), (6, 4), 1900)
    softbox('Fill', (-7.0, -4.0, 4.0), (5, 5), 420)
    softbox('Rim', (-3.0, 7.0, 6.5), (6, 2), 1500)
    softbox('Top', (0.0, 0.0, 10.0), (8, 3), 600)

    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.lens = 85
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def frame(cam, roots, direction=(1.0, -1.25, 0.62), margin=1.12):
    """Aims the camera at the bounding box of `roots` from a 3/4 direction."""
    pts = []
    bpy.context.view_layer.update()
    for r in roots:
        for o in hierarchy(r):
            if o.type == 'MESH':
                pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2
    sc = bpy.context.scene
    aspect = sc.render.resolution_x / sc.render.resolution_y
    # cam.data.angle is the field of view of the longer side; fit to the shorter one
    fov = 2 * math.atan(math.tan(cam.data.angle / 2) / max(aspect, 1 / aspect))
    dist = radius / math.sin(fov / 2) * margin
    d = Vector(direction).normalized()
    cam.location = centre + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def render(filename):
    path = os.path.join(PREVIEWS, filename)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f'RENDERED {filename}')


def set_visible(roots, visible):
    for r in roots:
        for o in hierarchy(r):
            o.hide_render = not visible


# ---------------------------------------------------------------- extra primitives

def _lathe(self, profile, mat, loc=(0, 0, 0), rot=None, segments=24, closed=True):
    """Revolves (radius, z) points around local Z. A closed profile gives a solid."""
    tb = bmesh.new()
    tb.loops.layers.uv.new('UVMap')
    rings = []
    for r, z in profile:
        r = max(r, 0.0015)
        rings.append([tb.verts.new((r * math.cos(2 * math.pi * j / segments), r * math.sin(2 * math.pi * j / segments), z))
                      for j in range(segments)])
    n = len(rings)
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(segments):
            k = (j + 1) % segments
            tb.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
    self._emit(tb, mat, loc, rot)


def _rod(self, p0, p1, radius, mat, segments=8):
    """Thin cylinder between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = d.to_track_quat('Z', 'Y').to_matrix()
    self.cyl(radius, d.length, (p0 + p1) / 2, mat, segments=segments, rot=rot)


Builder.lathe = _lathe
Builder.rod = _rod
