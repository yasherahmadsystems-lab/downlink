# Builds the launch-shot models: a small two-stage rideshare launcher and its pad.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# UNITS: unlike the spacecraft parts, these environment models are 1 Blender unit = 1 metre.
# Blender is Z-up; the glTF exporter converts to +Y up (Blender -Y becomes game +Z).
# Both are generic designs: they copy no real vehicle or launch site, and carry no markings.
#
#   env_launcher.glb  root "Launcher", origin at the centre of the nozzle exit plane.
#                     Children: Stage1, Stage2 (origin at the separation plane),
#                     Fairing_A (+X half) and Fairing_B (-X half), each with its origin at the
#                     base of its outer edge; SOCKET_plume, SOCKET_payload.
#   env_pad.glb       root "Pad", origin at ground level under the launcher axis.
#                     SOCKET_launcher marks where the launcher origin sits.
#
# Run:  blender -b -P art/blender/build_p6_launcher.py          (add  -- fast  to skip renders)
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
from common import Builder, empty, export_glb, hierarchy, material, render, reset, tri_count  # noqa: E402

FAST = 'fast' in sys.argv
R = 0.65  # tank radius, m
RF = 0.76  # fairing radius, m
MOUNT_Z = 2.5  # top of the launch mount above ground, m


def mats():
    return {
        'white': material('PaintedTank', (0.78, 0.77, 0.74), 0.0, 0.48),
        'fairing': material('FairingComposite', (0.80, 0.79, 0.75), 0.0, 0.36),
        'graphite': material('GraphiteStructure', (0.028, 0.03, 0.033), 0.35, 0.5),
        'seam': material('WeldSeam', (0.62, 0.61, 0.59), 0.2, 0.42),
        'alu': material('NozzleAlloy', (0.52, 0.53, 0.55), 1.0, 0.38),
        'scorch': material('HeatStain', (0.09, 0.075, 0.065), 0.8, 0.5),
        'orange': material('SignalBand', (0.78, 0.093, 0.023), 0.0, 0.5),
        'concrete': material('PadConcrete', (0.33, 0.32, 0.30), 0.0, 0.92),
        'deck': material('DeckConcrete', (0.40, 0.39, 0.37), 0.0, 0.88),
        'joint': material('ConcreteJoint', (0.12, 0.12, 0.115), 0.0, 0.95),
        'steel': material('GalvanisedSteel', (0.36, 0.37, 0.38), 0.85, 0.5),
        'duct': material('ScorchedDuct', (0.06, 0.055, 0.05), 0.2, 0.85),
        'lamp': material('FloodLamp', (1.0, 0.93, 0.8), 0.0, 0.4, emission=((1.0, 0.9, 0.74), 9.0)),
    }


def finish_at(b, origin, parent):
    """Finishes a Builder so the object's origin sits at `origin` (builder coordinates)."""
    ob = b.finish(parent=parent)
    ob.data.transform(Matrix.Translation(-Vector(origin)))
    ob.location = origin
    return ob


def half_shell(b, profile, mat, sign, segments=24):
    """Half of a surface of revolution about Z: the +X half (sign 1) or the -X half (-1)."""
    tb = bmesh.new()
    tb.loops.layers.uv.new('UVMap')
    rings = []
    for r, z in profile:
        r = max(r, 0.002)
        ring = []
        for j in range(segments + 1):
            a = -math.pi / 2 + math.pi * j / segments
            ring.append(tb.verts.new((sign * r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segments):
            tb.faces.new((rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]))
    bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
    # recalc guesses for open shells: make sure normals point away from the axis
    f0 = tb.faces[0]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((c.x, c.y, 0))) < 0:
        bmesh.ops.reverse_faces(tb, faces=tb.faces[:])
    b._emit(tb, mat, (0, 0, 0), None)


def ring(b, r, z, h, mat, proud=0.012, segments=48):
    b.cyl(r + proud, h, (0, 0, z), mat, segments=segments)


def bell(b, exit_r, length, loc, m_out, m_lip):
    """Engine nozzle with wall thickness, so it reads from below as well as from the side."""
    t = exit_r * 0.42  # throat
    z0 = loc[2]
    b.lathe([(exit_r, 0), (exit_r * 0.8, length * 0.3), (t * 1.25, length * 0.72), (t, length),
             (0.0, length), (0.0, length * 0.9), (t * 0.8, length * 0.86), (exit_r * 0.9, 0.0)],
            m_out, loc=loc, segments=20)
    # darker, heat-stained lip and a stiffening band
    b.cyl(exit_r + 0.006, length * 0.07, (loc[0], loc[1], z0 + length * 0.035), m_lip, segments=20)
    b.cyl(exit_r * 0.84, length * 0.035, (loc[0], loc[1], z0 + length * 0.3), m_lip, segments=20)
    # combustion chamber and turbopump stub above the throat
    b.cyl(t * 1.5, length * 0.28, (loc[0], loc[1], z0 + length * 1.14), m_out, segments=16, bevel=0.012)


def build_launcher(M):
    root = empty('Launcher', size=1.0)

    # ------------------------------------------------ stage 1
    b = Builder('Stage1', [M['white']])
    for i in range(5):  # engine cluster
        a = 2 * math.pi * i / 5 + 0.31
        bell(b, 0.165, 0.5, (0.4 * math.cos(a), 0.4 * math.sin(a), 0.0), M['alu'], M['scorch'])
    b.cyl(0.6, 0.05, (0, 0, 0.6), M['scorch'], segments=48)  # base heat shield
    b.lathe([(0.6, 0.58), (R + 0.02, 0.66), (R + 0.02, 1.5), (R, 1.56), (0.3, 1.56), (0.3, 0.58)], M['graphite'], segments=48)  # engine section
    for i in range(4):  # hold-down lugs
        a = math.pi / 4 + math.pi / 2 * i
        b.box((0.1, 0.16, 0.14), ((R + 0.045) * math.cos(a), (R + 0.045) * math.sin(a), 0.76), M['steel'], bevel=0.015,
              rot=Matrix.Rotation(a, 3, 'Z'))
    b.lathe([(R, 1.56), (R, 10.6), (0.2, 10.6), (0.2, 1.56)], M['white'], segments=48)  # tanks
    for z in (1.62, 5.52, 5.98, 10.52):  # ring frames at the tank ends
        ring(b, R, z, 0.07, M['seam'], proud=0.016)
    for z in (2.6, 3.58, 4.56, 6.95, 7.9, 8.85):  # circumferential welds
        ring(b, R, z, 0.022, M['seam'], proud=0.005)
    ring(b, R, 9.62, 0.34, M['orange'], proud=0.004)  # roll-pattern band: the one accent
    b.lathe([(R + 0.012, 10.6), (R + 0.012, 11.96), (0.5, 11.96), (0.5, 10.6)], M['graphite'], segments=48)  # interstage
    for i in range(24):  # separation-ring fasteners
        a = 2 * math.pi * i / 24
        b.box((0.03, 0.05, 0.03), ((R + 0.02) * math.cos(a), (R + 0.02) * math.sin(a), 11.86), M['steel'],
              rot=Matrix.Rotation(a, 3, 'Z'))
    # cable raceway up the far side, with brackets, and a vent line beside it
    b.box((0.16, 0.07, 8.9), (0, R + 0.03, 6.05), M['seam'], bevel=0.015)
    for z in (1.9, 3.4, 4.9, 6.4, 7.9, 9.4):
        b.box((0.24, 0.05, 0.06), (0, R + 0.02, z), M['steel'], bevel=0.008)
    b.rod((0.22, R + 0.02, 1.7), (0.22, R + 0.02, 5.5), 0.022, M['alu'])
    for a_deg in (40, 220):  # fill and drain ports
        a = math.radians(a_deg)
        b.cyl(0.07, 0.05, ((R + 0.01) * math.cos(a), (R + 0.01) * math.sin(a), 2.05), M['steel'], segments=16,
              rot=Matrix.Rotation(a, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'Y'), bevel=0.008)
    finish_at(b, (0, 0, 0), root)

    # ------------------------------------------------ stage 2 (origin on the separation plane)
    b = Builder('Stage2', [M['white']])
    bell(b, 0.3, 0.86, (0, 0, 11.02), M['alu'], M['scorch'])  # vacuum nozzle, hidden in the interstage
    b.lathe([(R, 11.96), (R, 14.1), (0.2, 14.1), (0.2, 11.96)], M['white'], segments=48)
    ring(b, R, 12.0, 0.08, M['seam'], proud=0.016)
    ring(b, R, 13.05, 0.022, M['seam'], proud=0.005)
    ring(b, R, 14.04, 0.1, M['graphite'], proud=0.02)
    for a_deg in (60, 150, 240, 330):  # cold-gas thruster pods
        a = math.radians(a_deg)
        b.box((0.1, 0.16, 0.12), ((R + 0.035) * math.cos(a), (R + 0.035) * math.sin(a), 13.7), M['graphite'], bevel=0.02,
              rot=Matrix.Rotation(a, 3, 'Z'))
    b.box((0.16, 0.07, 1.9), (0, R + 0.03, 13.05), M['seam'], bevel=0.015)  # raceway continues
    b.lathe([(R - 0.02, 14.1), (0.42, 14.46), (0.42, 14.52), (0.0, 14.52), (0.0, 14.1)], M['graphite'], segments=40)  # payload adapter
    b.cyl(0.46, 0.03, (0, 0, 14.535), M['alu'], segments=40, bevel=0.006)  # adapter plate
    stage2 = finish_at(b, (0, 0, 11.96), root)

    # ------------------------------------------------ fairing halves
    base = 14.1
    prof = [(R + 0.012, base), (RF, base + 0.42), (RF, 16.25)]
    n = 12
    for i in range(1, n + 1):  # ogive nose
        t = i / n
        prof.append((RF * (1 - t * t) ** 0.62, 16.25 + 2.0 * t))
    prof[-1] = (0.05, 18.22)
    for name, sign in (('Fairing_A', 1), ('Fairing_B', -1)):
        b = Builder(name, [M['fairing']])
        half_shell(b, prof, M['fairing'], sign)
        half_shell(b, [(RF + 0.006, base + 0.42), (RF + 0.006, base + 0.5)], M['seam'], sign)  # base ring
        half_shell(b, [(0.3, 17.72), (0.05, 18.23)], M['graphite'], sign, segments=12)  # nose cap
        for y in (-1, 1):  # split-line rail
            b.box((0.035, 0.03, 2.1), (sign * 0.02, y * (RF + 0.004), base + 0.42 + 1.07), M['graphite'])
        b.box((0.04, 0.3, 0.2), (sign * (RF + 0.012), 0, base + 0.95), M['seam'], bevel=0.012)  # access door
        finish_at(b, (sign * (R + 0.012), 0, base), root)

    empty('SOCKET_plume', (0, 0, 0), parent=root, size=0.5)
    empty('SOCKET_payload', (0, 0, 14.55), parent=root, size=0.3)
    return root, stage2


def lattice(b, x, y, z0, z1, w, m, bay=2.0):
    """Square lattice mast: four posts, a ring every bay and one diagonal per face per bay."""
    h = w / 2
    corners = [(x - h, y - h), (x + h, y - h), (x + h, y + h), (x - h, y + h)]
    for cx, cy in corners:
        b.box((0.13, 0.13, z1 - z0), (cx, cy, (z0 + z1) / 2), m)
    z = z0
    k = 0
    while z < z1 - 0.01:
        top = min(z + bay, z1)
        for i in range(4):
            p, q = corners[i], corners[(i + 1) % 4]
            b.rod((p[0], p[1], top), (q[0], q[1], top), 0.04, m, segments=6)
            a, c = (p, q) if (i + k) % 2 == 0 else (q, p)
            b.rod((a[0], a[1], z), (c[0], c[1], top), 0.03, m, segments=6)
        z = top
        k += 1


def build_pad(M):
    root = empty('Pad', size=2.0)
    b = Builder('Pad_Site', [M['concrete']])

    # Apron with expansion joints
    b.box((34, 34, 0.3), (0, 0, -0.11), M['concrete'])
    for i in range(-3, 4):
        if i == 0:
            continue
        b.box((34, 0.05, 0.01), (0, i * 4.85, 0.045), M['joint'])
        b.box((0.05, 34, 0.01), (i * 4.85, 0, 0.045), M['joint'])

    # Raised deck with a flame duct that opens toward +X
    b.box((4.5, 10, 1.0), (-3.75, 0, 0.5), M['deck'], bevel=0.04)
    for s in (-1, 1):
        b.box((7.5, 3.5, 1.0), (2.25, s * 3.25, 0.5), M['deck'], bevel=0.04)
    b.box((11.5, 3.0, 0.06), (4.25, 0, 0.07), M['duct'])  # duct floor, running out past the deck
    b.box((2.6, 3.0, 0.14), (-0.55, 0, 0.72), M['duct'], rot=Matrix.Rotation(math.radians(-38), 3, 'Y'))  # deflector
    for s in (-1, 1):  # duct liner
        b.box((7.5, 0.06, 0.96), (2.25, s * 1.47, 0.5), M['duct'])

    # Launch mount: four legs and an open table over the duct, with hold-down clamps
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.34, 0.34, 1.26), (sx * 1.05, sy * 1.78, 1.63), M['steel'], bevel=0.02)
    for sy in (-1, 1):
        b.box((2.9, 0.42, 0.26), (0, sy * 1.2, 2.37), M['steel'], bevel=0.025)
        b.box((2.44, 0.3, 0.2), (0, sy * 1.78, 2.2), M['steel'], bevel=0.02)
    for sx in (-1, 1):
        b.box((0.42, 2.82, 0.26), (sx * 1.2, 0, 2.37), M['steel'], bevel=0.025)
    for i in range(4):
        a = math.pi / 4 + math.pi / 2 * i
        rot = Matrix.Rotation(a, 3, 'Z')
        b.box((0.3, 0.26, 0.62), (1.02 * math.cos(a), 1.02 * math.sin(a), 2.8), M['graphite'], bevel=0.03, rot=rot)
        b.box((0.3, 0.2, 0.1), (0.84 * math.cos(a), 0.84 * math.sin(a), 3.16), M['graphite'], bevel=0.02, rot=rot)

    # Strongback tower on the -X side, with two service arms
    tx, ty = -4.4, 0.7
    b.box((1.9, 1.9, 0.25), (tx, ty, 1.12), M['steel'], bevel=0.03)
    lattice(b, tx, ty, 1.2, 16.4, 1.25, M['steel'])
    b.box((1.5, 1.5, 0.12), (tx, ty, 16.46), M['steel'], bevel=0.02)
    b.rod((tx, ty, 16.5), (tx, ty, 19.4), 0.035, M['steel'], segments=6)  # lightning rod
    for z, reach in ((10.4, -0.98), (15.3, -0.98)):
        b.box((abs(reach - (tx + 0.6)), 0.22, 0.26), ((reach + tx + 0.6) / 2, ty - 0.35, z), M['steel'], bevel=0.02)
        b.rod((tx + 0.6, ty - 0.35, z - 1.5), (reach - 0.5, ty - 0.35, z - 0.14), 0.035, M['steel'], segments=6)
        b.box((0.1, 0.5, 0.46), (reach + 0.02, ty - 0.35, z), M['graphite'], bevel=0.02)  # umbilical plate
    for z in (3.2, 5.2, 7.2, 9.2, 11.2, 13.2, 15.2):  # service platforms, railing side only
        b.box((1.5, 0.5, 0.05), (tx, ty + 0.9, z), M['steel'])
        b.rod((tx - 0.72, ty + 1.14, z + 1.0), (tx + 0.72, ty + 1.14, z + 1.0), 0.02, M['steel'], segments=6)
        for dx in (-0.72, 0.72):
            b.rod((tx + dx, ty + 1.14, z), (tx + dx, ty + 1.14, z + 1.0), 0.02, M['steel'], segments=6)

    # Lightning masts
    for mx, my in ((-13, 12), (13, 12), (-13, -12)):
        b.cyl(0.5, 0.3, (mx, my, 0.19), M['deck'], segments=16)
        b.cyl(0.2, 28.0, (mx, my, 14.3), M['steel'], segments=10, radius2=0.05)

    # Propellant tanks on saddles at the far corner, with a pipe run to the tower
    for i, tyy in enumerate((9.4, 12.2)):
        cx = -9.5
        rot = Matrix.Rotation(math.pi / 2, 3, 'Y')
        b.cyl(1.05, 5.4, (cx, tyy, 1.65), M['white'], segments=28, rot=rot)
        for e in (-1, 1):
            b.lathe([(1.05, 0), (0.9, 0.34), (0.5, 0.55), (0.0, 0.6), (0.0, 0.0)], M['white'], loc=(cx + e * 2.7, tyy, 1.65),
                    rot=Matrix.Rotation(e * math.pi / 2, 3, 'Y'), segments=28)
            b.box((0.3, 1.9, 0.75), (cx + e * 1.7, tyy, 0.42), M['steel'], bevel=0.02)
        b.cyl(0.1, 0.5, (cx + 0.6, tyy, 2.85), M['steel'], segments=12)
    b.rod((-9.0, 8.3, 0.28), (-5.0, 8.3, 0.28), 0.07, M['steel'], segments=8)
    b.rod((-5.0, 8.3, 0.28), (-5.0, 1.5, 0.28), 0.07, M['steel'], segments=8)
    for px in (-8.0, -6.5):
        b.box((0.12, 0.3, 0.2), (px, 8.3, 0.14), M['steel'])

    # Floodlight poles: heads face the vehicle
    for lx, ly in ((13, -12), (-8, -13), (12, 12)):
        b.cyl(0.09, 7.0, (lx, ly, 3.55), M['steel'], segments=8, radius2=0.06)
        aim = math.atan2(-ly, -lx)
        rot = Matrix.Rotation(aim, 3, 'Z') @ Matrix.Rotation(math.radians(-28), 3, 'Y')
        b.box((0.16, 1.1, 0.42), (lx, ly, 7.1), M['graphite'], bevel=0.02, rot=rot)
        b.box((0.02, 0.98, 0.32), (lx + 0.095 * math.cos(aim), ly + 0.095 * math.sin(aim), 7.13), M['lamp'], rot=rot)

    # Steps up to the deck
    for i in range(5):
        b.box((0.3, 1.2, 0.2), (-6.15 - 0.3 * i, -3.2, 0.9 - 0.2 * i), M['steel'])

    b.finish(parent=root)
    empty('SOCKET_launcher', (0, 0, MOUNT_Z), parent=root, size=0.6)
    return root


def preview_rig(res=(1280, 720)):
    """First-light look for the previews: sky dome plus a low warm sun."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 28
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('Dawn')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.34, 0.42, 0.6, 1)
    bg.inputs['Strength'].default_value = 0.9
    sc.world = w
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.86, 0.7)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(62), 0, math.radians(-38))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def look(cam, eye, target, lens):
    cam.location = eye
    cam.data.lens = lens
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def main():
    reset()
    M = mats()
    launcher, _ = build_launcher(M)
    export_glb(launcher, 'env_launcher.glb', release_names=True)
    pad = build_pad(M)
    export_glb(pad, 'env_pad.glb', release_names=True)
    if FAST:
        return

    launcher.location = (0, 0, MOUNT_Z)
    cam = preview_rig()
    look(cam, (24, -39, 1.6), (-3, 0, 10.5), 42)  # the game camera
    render('env_pad.png')
    for o in hierarchy(pad):
        o.hide_render = True
    ground = Builder('Ground', [M['deck']])
    ground.quad(200, 200, (0, 0, MOUNT_Z - 0.01), M['deck'])
    ground.finish()
    look(cam, (13, -19, 11), (0, 0, MOUNT_Z + 9.2), 50)
    render('env_launcher.png')
    look(cam, (3.2, -4.6, MOUNT_Z + 0.5), (0, 0, MOUNT_Z + 1.6), 35)
    render('env_launcher_detail.png')
    print('TRIS launcher', tri_count(launcher), 'pad', tri_count(pad))


if __name__ == '__main__':
    main()
