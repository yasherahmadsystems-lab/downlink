# P1 look-dev assets: 3U CubeSat bus, body solar panel, deployable solar wing, UHF whip.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# Run:  blender -b -P art/blender/build_p1_hero.py            (export + previews)
#       blender -b -P art/blender/build_p1_hero.py -- --fast   (export only)
#
# Dimensions follow the CubeSat form factor (a 3U is about 10 x 10 x 34 cm, with four
# corner rails; source: NASA CubeSat 101). Fine detail is art, not engineering data.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Matrix, Vector

import bpy
from common import (Builder, basis, blur, empty, export_glb, frame, height_to_normal, material,
                    render, reset, save_image, set_visible, studio, textured_material)

FAST = '--fast' in sys.argv
W = 1.0      # bus width, 10 cm
H = 3.405    # 3U height, 34.05 cm
RAIL = 0.085

FACES = {
    'px': basis((0, 1, 0), (0, 0, 1), (1, 0, 0)),
    'nx': basis((0, -1, 0), (0, 0, 1), (-1, 0, 0)),
    'py': basis((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
    'ny': basis((1, 0, 0), (0, 0, 1), (0, -1, 0)),
}
FACE_Z = 0.496  # distance of the mounting surface from the bus axis


def make_materials():
    M = {}
    M['anodized'] = material('AnodizedBlack', (0.012, 0.013, 0.015), 1.0, 0.38)
    M['blasted'] = material('BeadBlastedAluminium', (0.56, 0.57, 0.58), 1.0, 0.5)
    M['machined'] = material('MachinedAluminium', (0.86, 0.87, 0.88), 1.0, 0.24)
    M['steel'] = material('StainlessFastener', (0.42, 0.42, 0.43), 1.0, 0.3)
    M['spring'] = material('SpringSteelTape', (0.70, 0.68, 0.63), 1.0, 0.27)
    M['pcb'] = material('PanelSubstrate', (0.012, 0.014, 0.013), 0.0, 0.5)
    M['graphite'] = material('CarbonBackplate', (0.02, 0.02, 0.022), 0.0, 0.34, coat=0.4)
    M['kapton'] = material('KaptonTape', (0.62, 0.30, 0.035), 0.75, 0.24)
    M['delrin'] = material('BlackAcetal', (0.015, 0.015, 0.016), 0.0, 0.55)
    M['gold'] = material('GoldContact', (0.83, 0.62, 0.22), 1.0, 0.22)
    M['tag'] = material('RemoveBeforeFlightTag', (0.78, 0.09, 0.03), 0.0, 0.6)
    M['port'] = material('AccessPort', (0.02, 0.02, 0.022), 0.3, 0.6)
    M['solar'] = solar_material()
    return M


def solar_material():
    """Triple-junction style cells on a dark substrate: 7 cells along a 3U panel."""
    w_px, h_px = 256, 1024
    pw, ph = 0.81, 3.18  # panel face size in units
    x = (np.arange(w_px) + 0.5) / w_px * pw
    y = (np.arange(h_px) + 0.5) / h_px * ph
    X, Y = np.meshgrid(x, y)
    col = np.arange(w_px)[None, :].repeat(h_px, 0)

    alb = np.empty((h_px, w_px, 3), np.float32)
    alb[:] = (0.05, 0.052, 0.055)  # substrate (display values)
    rough = np.full((h_px, w_px), 0.6, np.float32)
    metal = np.zeros((h_px, w_px), np.float32)
    height = np.zeros((h_px, w_px), np.float32)

    cw, ch, gap, chamfer = 0.76, 0.40, 0.04, 0.055
    x0 = (pw - cw) / 2
    y_start = (ph - (7 * ch + 6 * gap)) / 2
    rng = np.random.default_rng(7)
    for i in range(7):
        y0 = y_start + i * (ch + gap)
        ax = np.minimum(X - x0, x0 + cw - X)
        ay = np.minimum(Y - y0, y0 + ch - Y)
        cell = (ax > 0) & (ay > 0) & (ax + ay > chamfer)
        tint = 1.0 + rng.uniform(-0.08, 0.08)
        base = np.array((0.045, 0.06, 0.15)) * tint
        alb[cell] = base
        fingers = cell & (col % 4 == 0)
        alb[fingers] = base * 1.45 + 0.012
        rough[cell] = 0.14
        height[cell] = 1.0
        bus = cell & (Y - y0 < 0.014)
        alb[bus] = (0.72, 0.72, 0.74)
        rough[bus], metal[bus] = 0.32, 1.0
        if i < 6:  # interconnect tabs to the next cell
            for tx in (0.2, 0.5, 0.8):
                tab = (np.abs(X - (x0 + cw * tx)) < 0.022) & (Y > y0 + ch - 0.005) & (Y < y0 + ch + gap + 0.012)
                alb[tab] = (0.74, 0.74, 0.76)
                rough[tab], metal[tab] = 0.35, 1.0
    # gold test pads at the panel foot
    pads = (Y > ph - 0.05) & (Y < ph - 0.02) & ((X * 12).astype(int) % 2 == 0) & (X > 0.2) & (X < 0.6)
    alb[pads] = (0.86, 0.66, 0.25)
    rough[pads], metal[pads] = 0.3, 1.0

    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    nrm = height_to_normal(blur(height, 1), 1.6)
    return textured_material(
        'SolarCells',
        save_image('solar_3u_albedo', alb, 'sRGB'),
        save_image('solar_3u_orm', orm, 'Non-Color'),
        save_image('solar_3u_normal', nrm.astype(np.float32), 'Non-Color'),
    )


def on_face(R, local):
    """Face-local point (x across, y along the bus, z out from the axis) in bus space."""
    return R @ Vector(local) + Vector((0, 0, H / 2))


# ------------------------------------------------------------------ bus

def build_bus(M):
    b = Builder('mod_bus_3u', [])
    c = W / 2 - RAIL / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((RAIL, RAIL, H), (sx * c, sy * c, H / 2), M['anodized'], bevel=0.009, segments=2)
            # separation-spring plunger on the bottom of each rail
            b.cyl(0.02, 0.03, (sx * c, sy * c, -0.012), M['steel'], segments=12)

    # end plates, set in 6.5 mm from the rail ends
    for z in (0.08, H - 0.08):
        b.box((0.84, 0.84, 0.03), (0, 0, z), M['blasted'], bevel=0.004)
    for sx in (-0.3, 0.3):
        for sy in (-0.3, 0.3):
            b.cyl(0.022, 0.012, (sx, sy, H - 0.062), M['steel'], segments=10)

    rib_y = [-H / 2 + 0.115, -H / 2 + 1.135, -H / 2 + 2.27, H / 2 - 0.115]
    for name, R in FACES.items():
        # skin panel, recessed behind the ribs
        b.box((0.832, H - 0.19, 0.012), on_face(R, (0, 0, FACE_Z - 0.022)), M['blasted'], bevel=0.003, rot=R)
        for y in rib_y:
            b.box((0.832, 0.075, 0.03), on_face(R, (0, y, FACE_Z - 0.015)), M['anodized'], bevel=0.005, rot=R)
            for x in (-0.31, 0.0, 0.31):
                b.cyl(0.017, 0.01, on_face(R, (x, y, FACE_Z + 0.002)), M['steel'], segments=10, rot=R)
        # skin fasteners down both long edges
        for y in np.linspace(-H / 2 + 0.34, H / 2 - 0.34, 9):
            if min(abs(y - r) for r in rib_y) < 0.1:
                continue
            for x in (-0.37, 0.37):
                b.cyl(0.013, 0.008, on_face(R, (x, y, FACE_Z - 0.014)), M['steel'], segments=8, rot=R)

    # access port and remove-before-flight pin on the -Y face
    R = FACES['ny']
    b.box((0.34, 0.2, 0.01), on_face(R, (0.12, -1.33, FACE_Z - 0.014)), M['port'], bevel=0.003, rot=R)
    for x in (0.02, 0.1, 0.18):
        b.box((0.05, 0.11, 0.008), on_face(R, (x, -1.33, FACE_Z - 0.008)), M['gold'], rot=R)
    b.cyl(0.02, 0.06, on_face(R, (-0.24, -1.33, FACE_Z + 0.012)), M['machined'], segments=14, rot=R)
    b.box((0.085, 0.36, 0.006), on_face(R, (-0.24, -1.54, FACE_Z + 0.036)), M['tag'], bevel=0.002, rot=R)

    bus = b.finish()

    for name, R in FACES.items():
        empty(f'SOCKET_face_{name}', on_face(R, (0, 0, FACE_Z)), R, bus)
    empty('SOCKET_wing_px', on_face(FACES['px'], (0, 0, FACE_Z)), FACES['px'], bus)
    flip = basis((0, 1, 0), (0, 0, -1), (-1, 0, 0))
    empty('SOCKET_wing_nx', on_face(flip, (0, 0, FACE_Z)), flip, bus)
    empty('SOCKET_top', (0, 0, H - 0.065), None, bus)
    empty('SOCKET_bottom', (0, 0, 0.065), basis((1, 0, 0), (0, -1, 0), (0, 0, -1)), bus)
    for i in range(3):
        empty(f'SOCKET_internal_{i + 1}', (0, 0, 0.57 + i * 1.135), None, bus)
    return bus


# ------------------------------------------------------------------ solar

def build_body_panel(M):
    b = Builder('mod_solar_body_3u', [])
    b.box((0.83, 3.20, 0.016), (0, 0, 0.008), M['pcb'], bevel=0.003)
    b.quad(0.81, 3.18, (0, 0, 0.0164), M['solar'])
    for x in (-0.385, 0.385):
        for y in (-1.56, 0.0, 1.56):
            b.cyl(0.016, 0.006, (x, y, 0.018), M['steel'], segments=8)
    return b.finish()


def build_wing(M):
    hinge_at = Vector((0.43, 0, 0.055))
    b = Builder('mod_solar_wing_3u', [])
    for y in (-1.0, 1.0):
        b.box((0.085, 0.24, 0.05), (0.40, y, 0.025), M['anodized'], bevel=0.006)
        b.cyl(0.012, 0.012, (0.385, y - 0.07, 0.052), M['steel'], segments=8)
        b.cyl(0.012, 0.012, (0.385, y + 0.07, 0.052), M['steel'], segments=8)
    Ry = Matrix.Rotation(math.pi / 2, 3, 'X')  # cylinder axis Z -> Y
    b.cyl(0.011, 2.5, hinge_at, M['steel'], segments=10, rot=Ry)
    # hold-down and release pad on the far edge
    b.box((0.07, 0.09, 0.04), (-0.385, 0, 0.02), M['delrin'], bevel=0.005)
    b.cyl(0.012, 0.012, (-0.385, 0, 0.043), M['gold'], segments=8)
    root = b.finish()

    hinge = empty('HINGE_wing', hinge_at, None, root)
    deployed = empty('HINGE_wing_DEPLOYED', hinge_at, Matrix.Rotation(math.pi / 2, 3, 'Y'), root)
    deployed['note'] = 'Rotation of HINGE_wing when the wing is fully deployed'

    p = Builder('solar_wing_panel', [])
    p.box((0.80, 3.20, 0.018), (-0.43, 0, 0), M['graphite'], bevel=0.003)
    p.quad(0.78, 3.18, (-0.43, 0, 0.0094), M['solar'])
    for y in (-0.55, 0.0, 0.55):
        p.cyl(0.021, 0.3, (0, y, 0), M['anodized'], segments=12, rot=Ry)
        p.box((0.06, 0.3, 0.012), (-0.03, y, 0), M['anodized'], bevel=0.002)
    for y in (-1.05, 0.0, 1.05):  # tape over the harness on the back face
        p.box((0.80, 0.13, 0.002), (-0.43, y, -0.0096), M['kapton'])
    p.box((0.05, 2.1, 0.004), (-0.2, 0, -0.011), M['kapton'])
    p.finish(parent=hinge)
    return root


# ------------------------------------------------------------------ antenna

def build_uhf(M):
    b = Builder('mod_antenna_uhf', [])
    b.box((0.44, 0.44, 0.07), (0, 0, 0.035), M['delrin'], bevel=0.012)
    b.box((0.3, 0.3, 0.008), (0, 0, 0.072), M['blasted'], bevel=0.003)
    for sx in (-0.17, 0.17):
        for sy in (-0.17, 0.17):
            b.cyl(0.016, 0.01, (sx, sy, 0.074), M['steel'], segments=8)
    b.cyl(0.035, 0.04, (0, 0, 0.09), M['gold'], segments=16, bevel=0.004)
    b.cyl(0.014, 0.03, (0, 0, 0.12), M['gold'], segments=10)
    for s in (-1, 1):
        b.box((0.09, 0.32, 0.024), (0, s * 0.37, 0.012), M['anodized'], bevel=0.004)
        b.box((0.12, 0.05, 0.055), (0, s * 0.515, 0.0275), M['anodized'], bevel=0.006)
        b.cyl(0.01, 0.15, (0, s * 0.535, 0.03), M['steel'], segments=8, rot=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    root = b.finish()

    for tag, s in (('a', 1), ('b', -1)):
        at = (0, s * 0.535, 0.03)
        hinge = empty(f'HINGE_whip_{tag}', at, None, root)
        empty(f'HINGE_whip_{tag}_DEPLOYED', at, Matrix.Rotation(s * math.pi / 2, 3, 'X'), root)
        t = Builder(f'uhf_tape_{tag}', [])
        t.box((0.07, 0.005, 1.7), (0, s * 0.006, -0.85), M['spring'], bevel=0.0015, segments=1)
        t.box((0.08, 0.012, 0.05), (0, s * 0.006, -1.7), M['delrin'], bevel=0.003)
        t.box((0.08, 0.02, 0.06), (0, s * 0.004, -0.03), M['anodized'], bevel=0.003)
        t.finish(parent=hinge)
    return root


# ------------------------------------------------------------------ run

def pose(root, deployed=True):
    """Snap every HINGE_* under root to its *_DEPLOYED twin (or back to stowed)."""
    kids = {o.name.split('.')[0]: o for o in root.children}
    for name, o in kids.items():
        if name.startswith('HINGE_') and not name.endswith('_DEPLOYED'):
            o.rotation_euler = kids[name + '_DEPLOYED'].rotation_euler if deployed else (0, 0, 0)


def attach(part, bus, socket):
    part.parent = next(o for o in bus.children if o.name.split('.')[0] == socket)


def main():
    reset()
    M = make_materials()

    bus = build_bus(M)
    export_glb(bus, 'mod_bus_3u.glb')
    panel = build_body_panel(M)
    export_glb(panel, 'mod_solar_body_3u.glb')
    wing = build_wing(M)
    export_glb(wing, 'mod_solar_wing_3u.glb')
    uhf = build_uhf(M)
    export_glb(uhf, 'mod_antenna_uhf.glb')
    if FAST:
        return

    cam = studio(samples=28, res=(900, 675))
    singles = [bus, panel, wing, uhf]

    def shot(root, filename, direction, prep=None):
        set_visible(singles, False)
        set_visible([root], True)
        if prep:
            prep()
        frame(cam, [root], direction)
        render(filename)

    shot(bus, 'mod_bus_3u.png', (1.0, -1.25, 0.6))

    def upright(o):  # stand a face-mounted part on end, outward side toward the camera
        o.location.z = 1.75
        o.rotation_euler = (math.radians(90), 0, math.radians(28))
    shot(panel, 'mod_solar_body_3u.png', (0.55, -1.0, 0.35), lambda: upright(panel))

    def wing_prep():
        upright(wing)
        next(o for o in wing.children if o.name == 'HINGE_wing').rotation_euler.y = math.radians(38)
    shot(wing, 'mod_solar_wing_3u.png', (0.55, -1.0, 0.35), wing_prep)

    def uhf_prep():
        uhf.location.z = 1.75
        pose(uhf, True)
        for o in uhf.children:  # half-way pose so the hinge reads
            if o.name.startswith('HINGE_') and not o.name.endswith('_DEPLOYED'):
                o.rotation_euler.x *= 0.72
    shot(uhf, 'mod_antenna_uhf.png', (1.0, -0.8, 0.45), uhf_prep)

    # Hero: fresh copies assembled through the sockets, everything deployed
    set_visible(singles, False)
    hero = build_bus(M)
    attach(build_body_panel(M), hero, 'SOCKET_face_py')
    for sock in ('SOCKET_wing_px', 'SOCKET_wing_nx'):
        w = build_wing(M)
        attach(w, hero, sock)
        pose(w, True)
    a = build_uhf(M)
    attach(a, hero, 'SOCKET_top')
    pose(a, True)
    hero.rotation_euler.z = math.radians(-150)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1200
    sc.cycles.samples = 72
    frame(cam, [hero], (1.0, -1.25, 0.5), margin=1.05)
    render('hero_cubesat_3u.png')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), 'p1_hero.blend'))


if __name__ == "__main__":
    main()
