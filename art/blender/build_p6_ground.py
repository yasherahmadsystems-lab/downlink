# Builds the ground-station antenna seen beside the launch pad: a 3.7 m tracking dish
# on an elevation-over-azimuth pedestal.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# UNITS: 1 Blender unit = 1 metre (environment model). Blender Z-up; exported +Y up.
# Generic design, no markings.
#
#   env_ground_dish.glb   root "Dish", origin at ground level under the pedestal.
#     Dish_Base  pad, pedestal, cabinet
#     Dish_Az    yoke; the game turns it about the vertical axis
#     Dish_El    child of Dish_Az, origin on the elevation axis; reflector, feed, counterweights.
#                Rest pose is 40 degrees up, kept as the node's rotation. At zero azimuth the
#                dish looks along Blender -Y (game +Z).
#
# Run:  blender -b -P art/blender/build_p6_ground.py          (add  -- fast  to skip the render)
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
from common import Builder, empty, export_glb, material, render, reset, tri_count  # noqa: E402

FAST = 'fast' in sys.argv
D = 3.7  # reflector diameter
F = 1.4  # focal length
PED = 2.85  # top of the pedestal
AXIS = 0.75  # elevation axis above the pedestal top
RX = Matrix.Rotation(math.pi / 2, 4, 'X')  # boresight: local +Z becomes -Y


def finish_at(b, origin, parent):
    ob = b.finish(parent=parent)
    ob.data.transform(Matrix.Translation(-Vector(origin)))
    ob.location = origin
    return ob


def main():
    reset()
    white = material('ReflectorPaint', (0.80, 0.79, 0.76), 0.0, 0.45)
    seam = material('PanelSeam', (0.5, 0.5, 0.48), 0.2, 0.5)
    alu = material('DishAluminium', (0.55, 0.56, 0.58), 1.0, 0.42)
    graphite = material('DishGraphite', (0.028, 0.03, 0.033), 0.3, 0.5)
    concrete = material('DishConcrete', (0.33, 0.32, 0.30), 0.0, 0.92)
    orange = material('DishSignal', (0.78, 0.093, 0.023), 0.0, 0.5)

    root = empty('Dish', size=1.0)

    b = Builder('Dish_Base', [concrete])
    b.box((3.0, 3.0, 0.25), (0, 0, 0.125), concrete, bevel=0.03)
    b.cyl(0.42, 0.08, (0, 0, 0.29), alu, segments=28, bevel=0.01)  # base flange
    for i in range(8):
        a = 2 * math.pi * i / 8
        b.cyl(0.025, 0.05, (0.36 * math.cos(a), 0.36 * math.sin(a), 0.34), graphite, segments=6)
    b.cyl(0.3, PED - 0.33, (0, 0, (PED + 0.33) / 2), white, segments=28, radius2=0.26)
    b.box((0.03, 0.34, 0.6), (0.3, 0, 1.1), seam, bevel=0.01)  # access hatch
    b.box((0.03, 0.03, 0.12), (0.325, 0.1, 1.1), orange)  # hatch handle: the one accent
    for z in (0.7, 1.05, 1.4, 1.75, 2.1, 2.45):  # ladder rungs
        b.rod((-0.2, -0.36, z), (0.2, -0.36, z), 0.014, alu, segments=6)
    for x in (-0.2, 0.2):
        b.rod((x, -0.36, 0.3), (x, -0.36, 2.7), 0.018, alu, segments=6)
    b.box((0.7, 0.5, 1.1), (-1.0, 0.9, 0.8), graphite, bevel=0.02)  # equipment cabinet
    b.box((0.74, 0.54, 0.05), (-1.0, 0.9, 1.37), alu)
    b.rod((-0.65, 0.9, 0.4), (-0.28, 0.2, 0.4), 0.03, graphite, segments=6)  # cable run
    finish_at(b, (0, 0, 0), root)

    b = Builder('Dish_Az', [graphite])
    b.cyl(0.36, 0.14, (0, 0, PED + 0.07), alu, segments=28, bevel=0.012)  # azimuth bearing
    b.box((0.9, 0.7, 0.34), (0, 0, PED + 0.31), graphite, bevel=0.03)  # drive housing
    for sx in (-1, 1):
        b.box((0.12, 0.34, 0.6), (sx * 0.52, 0, PED + 0.62), graphite, bevel=0.02)  # yoke arms
        b.cyl(0.11, 0.16, (sx * 0.52, 0, PED + AXIS), alu, segments=20, rot=Matrix.Rotation(math.pi / 2, 3, 'Y'), bevel=0.01)
    az = finish_at(b, (0, 0, PED), root)

    # Reflector group, built looking along +Z and then turned to look along -Y
    b = Builder('Dish_El', [white])
    off = 0.42  # reflector vertex ahead of the elevation axis
    n = 10
    prof = [((D / 2) * i / n, off + ((D / 2) * i / n) ** 2 / (4 * F)) for i in range(n + 1)]
    back = [(r, z - 0.035) for r, z in reversed(prof)]
    b.lathe(prof + back, white, segments=48)
    rim_z = prof[-1][1]
    b.lathe([(D / 2, rim_z - 0.05), (D / 2 + 0.035, rim_z - 0.05), (D / 2 + 0.035, rim_z + 0.02), (D / 2, rim_z + 0.02)], seam, segments=48)  # rolled rim
    for i in range(16):  # petal seams on the face, ribs on the back
        a = 2 * math.pi * i / 16
        c, s = math.cos(a), math.sin(a)
        for j in range(n):
            (r0, z0), (r1, z1) = prof[j], prof[j + 1]
            if r0 < 0.3:
                continue
            b.rod((r0 * c, r0 * s, z0 + 0.004), (r1 * c, r1 * s, z1 + 0.004), 0.006, seam, segments=4)
        b.rod((0.3 * c, 0.3 * s, off - 0.3), (1.7 * c, 1.7 * s, off + 1.7 ** 2 / (4 * F) - 0.06), 0.022, alu, segments=6)
    b.cyl(0.34, 0.36, (0, 0, off - 0.2), graphite, segments=24, bevel=0.02)  # hub
    b.lathe([(1.05, off + 0.1), (1.08, off + 0.1), (1.08, off + 0.16), (1.05, off + 0.16)], alu, segments=32)  # back ring
    b.box((1.0, 0.16, 0.16), (0, 0, 0), alu, bevel=0.02)  # elevation shaft
    for sx in (-1, 1):  # counterweight arms
        b.box((0.09, 0.09, 0.9), (sx * 0.3, 0, -0.45), alu, bevel=0.01)
        b.box((0.26, 0.34, 0.3), (sx * 0.3, 0, -0.95), graphite, bevel=0.03)
    feed_z = off + F
    for i in range(4):  # feed supports
        a = math.pi / 4 + math.pi / 2 * i
        r = 1.35
        b.rod((r * math.cos(a), r * math.sin(a), off + r * r / (4 * F)), (0.09 * math.cos(a), 0.09 * math.sin(a), feed_z - 0.05), 0.02, alu, segments=6)
    b.cyl(0.1, 0.3, (0, 0, feed_z - 0.1), graphite, segments=16, radius2=0.14, bevel=0.01)  # feed horn
    b.cyl(0.07, 0.12, (0, 0, feed_z + 0.11), alu, segments=12)
    el = b.finish(parent=az)
    el.data.transform(RX)
    el.location = (0, 0, AXIS)
    el.rotation_euler = (math.radians(-40), 0, 0)

    export_glb(root, 'env_ground_dish.glb')
    print('TRIS dish', tri_count(root))
    if FAST:
        return

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('Sky')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.34, 0.42, 0.6, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sc.world = w
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(58), 0, math.radians(-40))
    sc.collection.objects.link(sun)
    g = Builder('Ground', [concrete])
    g.quad(120, 120, (0, 0, 0), concrete)
    g.finish()
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    for name, eye in (('env_ground_dish.png', (6.5, -8.5, 3.2)), ('env_ground_dish_back.png', (-6.0, 8.0, 4.0))):
        cam.location = eye
        cam.rotation_euler = (Vector((0, 0, 2.9)) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        render(name)


if __name__ == '__main__':
    main()
