# Builds the integration hall dressing behind the stand: a cleanroom wall system,
# a thermal-vacuum chamber with its control rack, and aisle lines on the floor.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# UNITS: 1 Blender unit = 1 metre (environment model, unlike the spacecraft parts).
# Blender is Z-up; the exporter converts to +Y up, so Blender +Y is the far wall (game -Z).
# The origin is the stand position on the floor. The floor, stand and lights stay in code.
#
# The game camera only ever sees the lowest 2.4 m of the wall, between x = -5.5 and +4.9,
# and the strip x = -1.7..+4 must stay plain so the spacecraft keeps a clean outline.
# Everything here is placed with that in mind. Generic hardware: no markings of any kind.
#
#   env_hall.glb   root "Hall"; children Hall_Wall, Hall_Chamber, Hall_Rack, Hall_Floor
#
# Run:  blender -b -P art/blender/build_p6_hall.py          (add  -- fast  to skip renders)
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
from common import Builder, empty, export_glb, material, render, reset, tri_count  # noqa: E402

FAST = 'fast' in sys.argv
WALL_Y = 9.0
RX = Matrix.Rotation(math.pi / 2, 3, 'X')  # turns a Z-axis primitive to face the camera (-Y)


def mats():
    return {
        'panel': material('WallPanel', (0.48, 0.47, 0.44), 0.0, 0.78),
        'reveal': material('PanelReveal', (0.25, 0.25, 0.235), 0.0, 0.7),
        'cove': material('FloorCove', (0.40, 0.39, 0.37), 0.0, 0.6),
        'alu': material('BrushedAluminium', (0.60, 0.61, 0.62), 1.0, 0.42),
        'graphite': material('GraphitePaint', (0.03, 0.032, 0.035), 0.3, 0.55),
        'door': material('DoorLeaf', (0.55, 0.54, 0.51), 0.0, 0.6),
        'glass': material('DarkGlass', (0.012, 0.014, 0.016), 0.0, 0.12),
        'steel': material('ChamberStainless', (0.50, 0.50, 0.49), 1.0, 0.36),
        'steel_dark': material('ChamberFittings', (0.22, 0.22, 0.22), 1.0, 0.45),
        'blank': material('RackPanel', (0.34, 0.34, 0.33), 0.2, 0.5),
        'line': material('AisleLine', (0.2, 0.196, 0.185), 0.0, 0.6),
    }


def build_wall(M, root):
    b = Builder('Hall_Wall', [M['panel']])
    b.box((40, 0.1, 7), (0, WALL_Y + 0.05, 3.5), M['panel'])
    x = -19.8
    while x < 19.9:  # vertical reveals between 1.2 m panels
        b.box((0.014, 0.01, 7), (x, WALL_Y - 0.004, 3.5), M['reveal'])
        x += 1.2
    b.box((40, 0.01, 0.014), (0, WALL_Y - 0.004, 2.75), M['reveal'])  # horizontal reveal
    b.box((40, 0.06, 0.16), (0, WALL_Y - 0.03, 0.08), M['cove'], bevel=0.02)  # coved skirting
    # Low bumper rail on standoffs
    b.box((40, 0.035, 0.1), (0, WALL_Y - 0.085, 0.34), M['alu'], bevel=0.012)
    x = -19.2
    while x < 19.3:
        b.box((0.05, 0.07, 0.05), (x, WALL_Y - 0.04, 0.34), M['graphite'])
        x += 1.2
    # Low-wall return-air grilles, one every third panel
    for gx in (-8.4, -4.8, -1.2, 6.0):  # none behind the spacecraft
        b.box((0.66, 0.03, 0.4), (gx, WALL_Y - 0.012, 0.66), M['alu'], bevel=0.008)
        b.box((0.6, 0.02, 0.34), (gx, WALL_Y - 0.026, 0.66), M['graphite'])
        for i in range(7):
            b.box((0.58, 0.03, 0.012), (gx, WALL_Y - 0.036, 0.52 + i * 0.047), M['steel_dark'],
                  rot=Matrix.Rotation(math.radians(-32), 3, 'X'))
    # Personnel airlock door on the right
    dx = 4.15
    b.box((1.12, 0.05, 2.2), (dx, WALL_Y - 0.02, 1.1), M['alu'], bevel=0.012)  # frame
    b.box((0.98, 0.05, 2.1), (dx, WALL_Y - 0.035, 1.07), M['door'], bevel=0.01)  # leaf
    b.box((0.22, 0.02, 0.56), (dx + 0.2, WALL_Y - 0.065, 1.48), M['glass'])  # vision panel
    b.box((0.26, 0.02, 0.6), (dx + 0.2, WALL_Y - 0.058, 1.48), M['alu'], bevel=0.006)
    b.box((0.035, 0.07, 0.34), (dx - 0.36, WALL_Y - 0.085, 1.05), M['alu'], bevel=0.012)  # pull handle
    b.box((0.98, 0.012, 0.22), (dx, WALL_Y - 0.063, 0.14), M['alu'])  # kick plate
    b.finish(parent=root)


def build_chamber(M, root):
    """Horizontal thermal-vacuum chamber, door toward the camera."""
    cx, cz = -2.6, 1.0
    door_y = 7.3
    b = Builder('Hall_Chamber', [M['steel']])
    b.cyl(0.8, 1.6, (cx, door_y + 0.86, cz), M['steel'], segments=48, rot=RX)  # shell
    for y in (door_y + 0.5, door_y + 1.15):
        b.cyl(0.84, 0.06, (cx, y, cz), M['steel'], segments=48, rot=RX, bevel=0.012)  # stiffening rings
    b.cyl(0.92, 0.1, (cx, door_y + 0.03, cz), M['steel'], segments=48, rot=RX, bevel=0.015)  # shell flange
    b.cyl(0.92, 0.07, (cx, door_y - 0.065, cz), M['steel'], segments=48, rot=RX, bevel=0.015)  # door flange
    b.lathe([(0.86, 0.0), (0.84, 0.05), (0.72, 0.15), (0.46, 0.23), (0.0, 0.26), (0.0, 0.0)], M['steel'],
            loc=(cx, door_y - 0.09, cz), rot=RX, segments=48)  # dished door
    for i in range(16):  # swing clamps round the flange
        a = 2 * math.pi * (i + 0.5) / 16
        rot = Matrix.Rotation(-a, 3, 'Y')
        b.box((0.075, 0.2, 0.11), (cx + 0.94 * math.cos(a), door_y - 0.02, cz + 0.94 * math.sin(a)), M['steel_dark'], bevel=0.015, rot=rot)
        b.cyl(0.022, 0.26, (cx + 0.94 * math.cos(a), door_y - 0.02, cz + 0.94 * math.sin(a)), M['alu'], segments=8, rot=RX)
    # Viewport above the door centre
    b.cyl(0.15, 0.07, (cx, door_y - 0.32, cz + 0.36), M['steel'], segments=28, rot=RX, bevel=0.012)
    b.cyl(0.105, 0.075, (cx, door_y - 0.322, cz + 0.36), M['glass'], segments=28, rot=RX)
    for i in range(8):
        a = 2 * math.pi * i / 8
        b.cyl(0.012, 0.085, (cx + 0.128 * math.cos(a), door_y - 0.322, cz + 0.36 + 0.128 * math.sin(a)), M['steel_dark'], segments=6, rot=RX)
    # Davit: post, arm and the boss that carries the door
    px = cx - 1.12
    b.cyl(0.055, 1.62, (px, door_y - 0.1, 0.81), M['steel_dark'], segments=16)
    b.cyl(0.11, 0.03, (px, door_y - 0.1, 0.015), M['steel_dark'], segments=16)
    b.box((1.16, 0.07, 0.1), ((px + cx) / 2, door_y - 0.4, cz - 0.02), M['steel_dark'], bevel=0.015)
    b.box((0.09, 0.34, 0.1), (px, door_y - 0.25, cz - 0.02), M['steel_dark'], bevel=0.015)
    b.cyl(0.09, 0.14, (cx, door_y - 0.36, cz - 0.02), M['steel_dark'], segments=20, rot=RX, bevel=0.012)
    # Saddles and skid
    for y in (door_y + 0.4, door_y + 1.3):
        b.box((1.5, 0.1, 0.42), (cx, y, 0.27), M['graphite'], bevel=0.015)
    for sx in (-0.7, 0.7):
        b.box((0.12, 1.5, 0.08), (cx + sx, door_y + 0.85, 0.04), M['graphite'], bevel=0.01)
    # Pump line down the right side to a roughing pump
    b.rod((cx + 0.8, door_y + 0.9, cz + 0.1), (cx + 1.02, door_y + 0.9, cz + 0.1), 0.05, M['steel'], segments=12)
    b.rod((cx + 1.02, door_y + 0.9, cz + 0.1), (cx + 1.02, door_y + 0.9, 0.42), 0.05, M['steel'], segments=12)
    b.box((0.34, 0.5, 0.4), (cx + 1.02, door_y + 0.9, 0.22), M['graphite'], bevel=0.03)
    ob = b.finish(parent=root)
    # A 1.5 m class chamber: scaled about its back foot so its top stays below the screen header
    pivot = Vector((cx, WALL_Y - 0.1, 0))
    ob.data.transform(Matrix.Translation(pivot) @ Matrix.Scale(0.82, 4) @ Matrix.Translation(-pivot))


def build_rack(M, root):
    """Chamber control rack: blanking panels and handles, no screens."""
    x, y = -4.2, 8.5
    b = Builder('Hall_Rack', [M['graphite']])
    b.box((0.62, 0.7, 1.42), (x, y, 0.76), M['graphite'], bevel=0.02)
    b.box((0.66, 0.74, 0.05), (x, y, 0.025), M['steel_dark'])
    z = 0.2
    for h in (0.18, 0.27, 0.13, 0.27, 0.18, 0.22):
        b.box((0.5, 0.012, h - 0.012), (x, y - 0.352, z + h / 2), M['blank'], bevel=0.004)
        for sx in (-0.21, 0.21):
            b.box((0.014, 0.03, min(0.1, h - 0.06)), (x + sx, y - 0.37, z + h / 2), M['alu'], bevel=0.004)
        z += h
    b.finish(parent=root)


def build_floor(M, root):
    b = Builder('Hall_Floor', [M['line']])
    for y in (6.6, 7.8 - 0.75):  # aisle between the stand area and the chamber
        b.box((40, 0.045, 0.002), (0, y, 0.0015), M['line'])
    b.finish(parent=root)


def main():
    reset()
    M = mats()
    root = empty('Hall', size=1.0)
    build_wall(M, root)
    build_chamber(M, root)
    build_rack(M, root)
    build_floor(M, root)
    export_glb(root, 'env_hall.glb')
    print('TRIS hall', tri_count(root))
    if FAST:
        return

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('HallLight')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.69, 0.66, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    sc.world = w
    for lx in (-6, 0, 6):
        for ly in (1, 6):
            l = bpy.data.lights.new('Softbox', 'AREA')
            l.shape = 'RECTANGLE'
            l.size, l.size_y = 3.6, 1.2
            l.energy = 2600
            o = bpy.data.objects.new('Softbox', l)
            o.location = (lx, ly, 6)
            sc.collection.objects.link(o)
    fb = Builder('Floor', [material('HallFloor', (0.81, 0.80, 0.76), 0.0, 0.3)])
    fb.quad(80, 80, (0, 0, 0), fb.mats[0])
    fb.finish()
    sb = Builder('StandIn', [M['graphite']])  # where the spacecraft goes
    sb.box((0.1, 0.1, 0.34), (0, 0, 1.19), M['graphite'])
    sb.cyl(0.028, 1.0, (0, 0, 0.5), M['alu'], segments=16)
    sb.finish()
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle_y = math.radians(30)

    def look(eye, target):
        cam.location = eye
        cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()

    look((-0.22, -1.16, 1.44), (-0.22, 0, 1.2))  # the title-screen camera
    render('env_hall.png')
    look((-0.03, -1.34, 1.42), (-0.03, 0, 1.19))  # the Design Lab camera
    render('env_hall_lab.png')
    cam.data.angle_y = math.radians(42)
    look((0.6, 2.2, 1.7), (-2.9, 8.2, 0.95))
    render('env_hall_chamber.png')


if __name__ == '__main__':
    main()
