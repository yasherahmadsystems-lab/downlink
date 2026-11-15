# P2 asset batch: CubeSat buses (1U/3U/6U), 1U body panel, S-band patch, small dish,
# three instruments, three internal modules and the rideshare deployer.
# Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
#
# Run:  blender -b -P art/blender/build_p2_parts.py            (export + previews)
#       blender -b -P art/blender/build_p2_parts.py -- --fast   (export only)
#
# Form factors follow NASA CubeSat 101 (1U = 10 cm cube; 3U and 6U are stacks of
# that unit). Everything else about the shapes is art, not engineering data.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Matrix, Vector

import bpy
from build_p1_hero import FACES, RAIL, build_body_panel, build_uhf, build_wing, make_materials, pose
from common import (Builder, basis, blur, empty, export_glb, frame, height_to_normal, material, render,
                    reset, save_image, set_visible, studio, textured_material)

FAST = '--fast' in sys.argv
U = 1.135  # one unit of height, 10 cm scale
RX = Matrix.Rotation(math.pi / 2, 3, 'X')  # cylinder axis Z -> Y
RY = Matrix.Rotation(math.pi / 2, 3, 'Y')  # cylinder axis Z -> X


def extra_materials(M):
    M['glass'] = material('LensGlass', (0.01, 0.014, 0.03), 0.0, 0.04, coat=1.0)
    M['white'] = material('RadiatorWhite', (0.82, 0.82, 0.80), 0.0, 0.55)
    M['ceramic'] = material('PatchCeramic', (0.80, 0.77, 0.70), 0.0, 0.45)
    M['pcbgreen'] = material('CircuitBoard', (0.012, 0.085, 0.04), 0.0, 0.42, coat=0.3)
    M['chip'] = material('ChipPackage', (0.02, 0.02, 0.022), 0.0, 0.45)
    M['foil'] = material('GoldMLI', (0.80, 0.56, 0.16), 1.0, 0.3)
    M['solar1u'] = solar_material_1u()
    return M


def solar_material_1u():
    """Two cells on a 1U face (same cell style as the 3U texture)."""
    w_px, h_px = 256, 256
    pw, ph = 0.81, 0.93
    x = (np.arange(w_px) + 0.5) / w_px * pw
    y = (np.arange(h_px) + 0.5) / h_px * ph
    X, Y = np.meshgrid(x, y)
    col = np.arange(w_px)[None, :].repeat(h_px, 0)
    alb = np.empty((h_px, w_px, 3), np.float32)
    alb[:] = (0.05, 0.052, 0.055)
    rough = np.full((h_px, w_px), 0.6, np.float32)
    metal = np.zeros((h_px, w_px), np.float32)
    height = np.zeros((h_px, w_px), np.float32)
    cw, ch, gap, chamfer = 0.76, 0.40, 0.04, 0.055
    x0 = (pw - cw) / 2
    y_start = (ph - (2 * ch + gap)) / 2
    for i in range(2):
        y0 = y_start + i * (ch + gap)
        ax = np.minimum(X - x0, x0 + cw - X)
        ay = np.minimum(Y - y0, y0 + ch - Y)
        cell = (ax > 0) & (ay > 0) & (ax + ay > chamfer)
        base = np.array((0.045, 0.06, 0.15)) * (1.0 + 0.05 * (i - 0.5))
        alb[cell] = base
        alb[cell & (col % 4 == 0)] = base * 1.45 + 0.012
        rough[cell] = 0.14
        height[cell] = 1.0
        bus = cell & (Y - y0 < 0.014)
        alb[bus] = (0.72, 0.72, 0.74)
        rough[bus], metal[bus] = 0.32, 1.0
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    nrm = height_to_normal(blur(height, 1), 1.6)
    return textured_material('SolarCells1U', save_image('solar_1u_albedo', alb, 'sRGB'),
                             save_image('solar_1u_orm', orm, 'Non-Color'),
                             save_image('solar_1u_normal', nrm.astype(np.float32), 'Non-Color'))


# ------------------------------------------------------------------ buses

def build_bus(M, name, wx, wy, units):
    """CubeSat structure of wx by wy (10 cm units) and `units` U tall, with all sockets."""
    h = units * U
    hx, hy = wx / 2, wy / 2
    b = Builder(name, [])
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (sx * (hx - RAIL / 2), sy * (hy - RAIL / 2))
            b.box((RAIL, RAIL, h), (*p, h / 2), M['anodized'], bevel=0.009, segments=2)
            b.cyl(0.02, 0.03, (*p, -0.012), M['steel'], segments=12)
    for z in (0.08, h - 0.08):
        b.box((wx - 0.16, wy - 0.16, 0.03), (0, 0, z), M['blasted'], bevel=0.004)
    for sx in (-(hx - 0.2), hx - 0.2):
        for sy in (-(hy - 0.2), hy - 0.2):
            b.cyl(0.022, 0.012, (sx, sy, h - 0.062), M['steel'], segments=10)

    def at(R, local):
        return R @ Vector(local) + Vector((0, 0, h / 2))

    dims = {'px': (wy, hx), 'nx': (wy, hx), 'py': (wx, hy), 'ny': (wx, hy)}  # face width, distance from axis
    rib_y = [-h / 2 + 0.115] + [-h / 2 + k * U for k in range(1, units)] + [h / 2 - 0.115]
    for face, R in FACES.items():
        fw, fd = dims[face]
        fd -= 0.004
        b.box((fw - 0.168, h - 0.19, 0.012), at(R, (0, 0, fd - 0.018)), M['blasted'], bevel=0.003, rot=R)
        for y in rib_y:
            b.box((fw - 0.168, 0.075, 0.03), at(R, (0, y, fd - 0.011)), M['anodized'], bevel=0.005, rot=R)
            for x in (-(fw / 2 - 0.19), 0.0, fw / 2 - 0.19):
                b.cyl(0.017, 0.01, at(R, (x, y, fd + 0.006)), M['steel'], segments=10, rot=R)
        if fw > 1.5:  # centre stile on the wide 6U faces
            b.box((0.075, h - 0.2, 0.03), at(R, (0, 0, fd - 0.011)), M['anodized'], bevel=0.005, rot=R)
        for y in np.linspace(-h / 2 + 0.3, h / 2 - 0.3, max(3, units * 3)):
            if min(abs(y - r) for r in rib_y) < 0.1:
                continue
            for x in (-(fw / 2 - 0.13), fw / 2 - 0.13):
                b.cyl(0.013, 0.008, at(R, (x, y, fd - 0.01)), M['steel'], segments=8, rot=R)

    # access port and remove-before-flight pin, low on the -X face
    R = FACES['nx']
    fd = hx - 0.004
    y = -h / 2 + 0.5
    b.box((0.34, 0.2, 0.01), at(R, (0.12, y, fd - 0.01)), M['port'], bevel=0.003, rot=R)
    for x in (0.02, 0.1, 0.18):
        b.box((0.05, 0.11, 0.008), at(R, (x, y, fd - 0.004)), M['gold'], rot=R)
    b.cyl(0.02, 0.06, at(R, (-0.24, y, fd + 0.016)), M['machined'], segments=14, rot=R)
    b.box((0.085, 0.3, 0.006), at(R, (-0.24, y - 0.19, fd + 0.04)), M['tag'], bevel=0.002, rot=R)

    bus = b.finish()
    bus['units'] = units

    col = 0.5657 if wx > 1.5 else 0.0  # 6U has two columns on its wide faces
    for face, R in FACES.items():
        fw, fd = dims[face]
        fd -= 0.004
        if fw > 1.5:
            empty(f'SOCKET_face_{face}', at(R, (-col, 0, fd)), R, bus)
            empty(f'SOCKET_face_{face}2', at(R, (col, 0, fd)), R, bus)
        else:
            empty(f'SOCKET_face_{face}', at(R, (0, 0, fd)), R, bus)
    empty('SOCKET_wing_px', at(FACES['px'], (0, 0, hx - 0.004)), FACES['px'], bus)
    flip = basis((0, 1, 0), (0, 0, -1), (-1, 0, 0))
    empty('SOCKET_wing_nx', at(flip, (0, 0, hx - 0.004)), flip, bus)
    empty('SOCKET_top', (0, 0, h - 0.065), None, bus)
    empty('SOCKET_bottom', (0, 0, 0.065), basis((1, 0, 0), (0, -1, 0), (0, 0, -1)), bus)
    if units == 1:  # a 1U holds two boards, no attitude-control unit
        empty('SOCKET_internal_1', (0, 0, 0.36), None, bus)
        empty('SOCKET_internal_2', (0, 0, 0.82), None, bus)
    for i in range(units if units > 1 else 0):
        empty(f'SOCKET_internal_{i + 1}', (0, 0, (i + 0.5) * U), None, bus)
    # payload looks out of the -Y face at the top; the comms antenna sits lower (a 1U has no room for one)
    R = FACES['ny']
    empty('SOCKET_payload', at(R, (-col, h / 2 - U / 2, hy - 0.004)), R, bus)
    if units > 1:
        empty('SOCKET_comms', at(R, (col, -h / 2 + U / 2, hy - 0.004)), R, bus)
    return bus


def build_body_panel_1u(M):
    b = Builder('mod_solar_body_1u', [])
    b.box((0.83, 0.95, 0.016), (0, 0, 0.008), M['pcb'], bevel=0.003)
    b.quad(0.81, 0.93, (0, 0, 0.0164), M['solar1u'])
    for x in (-0.385, 0.385):
        for y in (-0.44, 0.44):
            b.cyl(0.016, 0.006, (x, y, 0.018), M['steel'], segments=8)
    return b.finish()


# ------------------------------------------------------------------ antennas

def build_sband(M):
    b = Builder('mod_antenna_sband', [])
    b.box((0.56, 0.56, 0.024), (0, 0, 0.012), M['blasted'], bevel=0.004)
    b.box((0.42, 0.42, 0.034), (0, 0, 0.041), M['ceramic'], bevel=0.005)
    b.box((0.28, 0.28, 0.004), (0, 0, 0.06), M['gold'])
    b.cyl(0.012, 0.006, (0.06, 0.05, 0.063), M['steel'], segments=8)  # feed pin
    for sx in (-0.24, 0.24):
        for sy in (-0.24, 0.24):
            b.cyl(0.016, 0.008, (sx, sy, 0.027), M['steel'], segments=8)
    b.cyl(0.028, 0.09, (0.3, 0, 0.014), M['gold'], segments=12, rot=RY)  # coax connector
    return b.finish()


def build_dish(M):
    b = Builder('mod_antenna_dish', [])
    R, depth, t = 0.46, 0.13, 0.008
    f = R * R / (4 * depth)
    z0 = 0.13
    rs = np.linspace(0.0, R, 9)
    back = [(r, z0 + r * r / (4 * f)) for r in rs]
    front = [(r, z0 + r * r / (4 * f) + t) for r in rs[::-1]]
    b.lathe(back + front, M['white'], segments=32)
    b.cyl(R + 0.004, 0.012, (0, 0, z0 + depth + 0.004), M['anodized'], segments=32)  # rim band
    b.cyl(R - 0.004, 0.014, (0, 0, z0 + depth + 0.004), M['white'], segments=32)
    b.box((0.3, 0.3, 0.03), (0, 0, 0.015), M['anodized'], bevel=0.005)
    b.cyl(0.07, 0.11, (0, 0, 0.08), M['blasted'], segments=20)
    feed_z = z0 + f
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.5
        p0 = (0.8 * R * math.cos(a), 0.8 * R * math.sin(a), z0 + (0.8 * R) ** 2 / (4 * f))
        b.rod(p0, (0.03 * math.cos(a), 0.03 * math.sin(a), feed_z), 0.008, M['anodized'])
    b.cyl(0.05, 0.07, (0, 0, feed_z - 0.015), M['blasted'], segments=16, radius2=0.03)
    b.cyl(0.032, 0.03, (0, 0, feed_z + 0.03), M['gold'], segments=12)
    return b.finish()


# ------------------------------------------------------------------ instruments

def build_imager(M):
    b = Builder('mod_inst_imager', [])
    b.box((0.8, 0.8, 0.03), (0, 0, 0.015), M['anodized'], bevel=0.005)
    b.box((0.62, 0.62, 0.24), (0, 0, 0.15), M['blasted'], bevel=0.012)
    for sx in (-0.34, 0.34):
        for sy in (-0.34, 0.34):
            b.cyl(0.02, 0.012, (sx, sy, 0.034), M['steel'], segments=8)
    # lens barrel with a recessed front element and a baffle lip
    barrel = [(0.23, 0.27), (0.23, 0.6), (0.27, 0.6), (0.27, 0.7), (0.245, 0.7), (0.245, 0.585), (0.0, 0.585), (0.0, 0.27)]
    b.lathe(barrel, M['anodized'], segments=32)
    b.cyl(0.24, 0.006, (0, 0, 0.59), M['glass'], segments=32)
    b.cyl(0.275, 0.02, (0, 0, 0.42), M['machined'], segments=32)  # focus ring
    b.box((0.03, 0.5, 0.2), (0.325, 0, 0.15), M['white'], bevel=0.004)  # radiator plate
    b.box((0.16, 0.1, 0.05), (-0.2, -0.33, 0.1), M['gold'], bevel=0.005)  # data connector
    return b.finish()


def build_radiometer(M):
    b = Builder('mod_inst_radiometer', [])
    b.box((0.8, 0.8, 0.03), (0, 0, 0.015), M['anodized'], bevel=0.005)
    b.box((0.7, 0.7, 0.26), (0, 0, 0.16), M['foil'], bevel=0.02)
    for s in (-1, 1):  # yoke holding the scan drum
        b.box((0.05, 0.2, 0.34), (s * 0.31, 0, 0.45), M['anodized'], bevel=0.006)
        b.cyl(0.05, 0.03, (s * 0.345, 0, 0.53), M['steel'], segments=14, rot=RY)
    b.cyl(0.2, 0.52, (0, 0, 0.53), M['blasted'], segments=28, rot=RY, bevel=0.01)
    b.box((0.36, 0.16, 0.2), (0, -0.13, 0.6), M['port'], bevel=0.01, rot=Matrix.Rotation(math.radians(35), 3, 'X'))
    b.cyl(0.085, 0.07, (0.39, 0, 0.53), M['anodized'], segments=18, rot=RY)  # scan motor
    for x in (-0.2, 0.0, 0.2):  # feed horns facing the drum
        b.cyl(0.05, 0.08, (x, 0.27, 0.33), M['gold'], segments=12, radius2=0.025)
    return b.finish()


def build_magnetometer(M):
    b = Builder('mod_inst_magnetometer', [])
    b.box((0.36, 0.36, 0.03), (0, 0, 0.015), M['anodized'], bevel=0.005)
    b.box((0.26, 0.2, 0.09), (0, 0.04, 0.075), M['blasted'], bevel=0.008)
    for s in (-1, 1):
        b.box((0.03, 0.08, 0.1), (s * 0.07, -0.1, 0.08), M['anodized'], bevel=0.004)
    b.cyl(0.012, 0.2, (0, -0.1, 0.1), M['steel'], segments=8, rot=RY)
    root = b.finish()

    at = (0, -0.1, 0.1)
    hinge = empty('HINGE_boom', at, None, root)
    empty('HINGE_boom_DEPLOYED', at, Matrix.Rotation(-math.pi / 2, 3, 'X'), root)
    t = Builder('mag_boom', [])
    L = 1.7
    t.box((0.06, 0.1, 0.05), (0, -0.04, 0), M['anodized'], bevel=0.004)
    t.cyl(0.016, L, (0, -L / 2 - 0.06, 0), M['graphite'], segments=10, rot=RX)
    for y in (-0.5, -1.0, -1.5):
        t.cyl(0.02, 0.03, (0, y, 0), M['kapton'], segments=10, rot=RX)  # harness ties
    t.box((0.12, 0.2, 0.12), (0, -L - 0.14, 0), M['foil'], bevel=0.012)  # sensor head
    t.box((0.05, 0.03, 0.05), (0, -L - 0.03, 0), M['anodized'], bevel=0.003)
    t.finish(parent=hinge)
    return root


# ------------------------------------------------------------------ internal modules

def standoffs(b, M, z0, z1, r=0.4):
    for sx in (-r, r):
        for sy in (-r, r):
            b.cyl(0.022, z1 - z0, (sx, sy, (z0 + z1) / 2), M['steel'], segments=8)


def build_battery(M):
    b = Builder('mod_int_battery', [])
    b.box((0.9, 0.9, 0.016), (0, 0, -0.2), M['pcbgreen'], bevel=0.002)
    b.box((0.9, 0.9, 0.016), (0, 0, 0.1), M['pcbgreen'], bevel=0.002)
    standoffs(b, M, -0.26, 0.16)
    for y in (-0.3, -0.1, 0.1, 0.3):
        b.cyl(0.092, 0.62, (0, y, -0.09), M['kapton'], segments=18, rot=RY)
        for s in (-1, 1):
            b.cyl(0.07, 0.02, (s * 0.32, y, -0.09), M['steel'], segments=14, rot=RY)
    for s in (-1, 1):
        b.box((0.05, 0.82, 0.2), (s * 0.36, 0, -0.09), M['delrin'], bevel=0.006)
    b.box((0.22, 0.12, 0.05), (0.2, 0.3, 0.135), M['chip'], bevel=0.004)
    b.box((0.3, 0.08, 0.06), (-0.2, -0.34, 0.14), M['ceramic'], bevel=0.004)  # power connector
    return b.finish()


def build_computer(M):
    b = Builder('mod_int_computer', [])
    b.box((0.9, 0.9, 0.016), (0, 0, 0), M['pcbgreen'], bevel=0.002)
    standoffs(b, M, -0.12, 0.12)
    b.box((0.24, 0.24, 0.03), (-0.08, -0.02, 0.023), M['chip'], bevel=0.003)
    b.box((0.2, 0.2, 0.004), (-0.08, -0.02, 0.04), M['machined'])  # heat spreader
    for x, y in ((0.24, 0.12), (0.24, -0.12), (-0.3, -0.3)):
        b.box((0.12, 0.2, 0.022), (x, y, 0.019), M['chip'], bevel=0.002)
    b.box((0.72, 0.085, 0.1), (0, 0.36, 0.058), M['delrin'], bevel=0.004)  # stack connector
    b.box((0.68, 0.045, 0.006), (0, 0.36, 0.11), M['gold'])
    b.box((0.16, 0.14, 0.02), (0.3, -0.33, 0.018), M['steel'], bevel=0.002)  # card slot
    b.cyl(0.035, 0.03, (-0.33, 0.12, 0.023), M['steel'], segments=12)  # oscillator can
    for x in np.linspace(-0.3, 0.1, 6):
        b.box((0.03, 0.05, 0.012), (x, -0.36, 0.014), M['ceramic'])
    return b.finish()


def build_adcs(M):
    b = Builder('mod_int_adcs', [])
    b.box((0.8, 0.8, 0.42), (0, 0, 0), M['blasted'], bevel=0.015)
    for rot, loc in ((None, (0, 0, 0.215)), (RY, (0.405, 0, 0)), (RX, (0, -0.405, 0))):
        b.cyl(0.19 if rot is not None else 0.26, 0.03, loc, M['anodized'], segments=28, rot=rot, bevel=0.005)
        off = Vector(loc) * 1.06
        b.cyl(0.07, 0.03, off, M['machined'], segments=18, rot=rot)
    b.box((0.2, 0.06, 0.08), (-0.2, 0.41, 0.08), M['gold'], bevel=0.004)
    for sx in (-0.34, 0.34):
        for sy in (-0.34, 0.34):
            b.cyl(0.018, 0.01, (sx, sy, 0.214), M['steel'], segments=8)
    return b.finish()


# ------------------------------------------------------------------ deployer

def build_deployer(M):
    b = Builder('mod_deployer_3u', [])
    w, h, t = 1.32, 3.74, 0.04
    b.box((w, w, 0.06), (0, 0, 0.03), M['anodized'], bevel=0.006)
    for R in FACES.values():
        b.box((w - 0.02, h, t), R @ Vector((0, 0, w / 2 - t / 2)) + Vector((0, 0, 0.06 + h / 2)), M['blasted'], bevel=0.004, rot=R)
        # lightening windows down each wall
        for y in (-1.15, 0.0, 1.15):
            b.box((0.62, 0.8, 0.012), R @ Vector((0, y, w / 2 + 0.002)) + Vector((0, 0, 0.06 + h / 2)), M['port'], bevel=0.004, rot=R)
        for y in np.linspace(-h / 2 + 0.12, h / 2 - 0.12, 8):
            for x in (-0.58, 0.58):
                b.cyl(0.02, 0.012, R @ Vector((x, y, w / 2 + 0.004)) + Vector((0, 0, 0.06 + h / 2)), M['steel'], segments=8, rot=R)
    b.box((w + 0.04, w + 0.04, 0.07), (0, 0, 0.06 + h - 0.035), M['anodized'], bevel=0.006)  # door frame
    b.box((w - 0.12, w - 0.12, 0.08), (0, 0, 0.06 + h - 0.035), M['port'])  # dark opening
    b.box((0.9, 0.9, 0.03), (0, 0, 0.1), M['machined'], bevel=0.004)  # pusher plate
    b.cyl(0.12, 0.05, (0, 0, 0.075), M['steel'], segments=16)  # main spring seat
    root = b.finish()
    empty('SOCKET_cubesat', (0, 0, 0.14), None, root)

    top = 0.06 + h + 0.02
    at = (-w / 2 - 0.02, 0, top)
    hinge = empty('HINGE_door', at, None, root)
    empty('HINGE_door_DEPLOYED', at, Matrix.Rotation(math.radians(-112), 3, 'Y'), root)
    d = Builder('deployer_door', [])
    d.box((w + 0.04, w + 0.04, 0.04), (w / 2 + 0.02, 0, 0), M['blasted'], bevel=0.005)
    d.box((0.7, 0.7, 0.012), (w / 2 + 0.02, 0, 0.022), M['anodized'], bevel=0.004)
    d.cyl(0.02, w, (0, 0, 0), M['steel'], segments=10, rot=RX)
    d.box((0.1, 0.16, 0.05), (w + 0.02, 0, 0.01), M['anodized'], bevel=0.005)  # latch
    d.finish(parent=hinge)
    return root


# ------------------------------------------------------------------ run

def main():
    reset()
    M = extra_materials(make_materials())

    builders = [
        (lambda: build_bus(M, 'mod_bus_1u', 1.0, 1.0, 1), 'bus'),
        (lambda: build_bus(M, 'mod_bus_3u', 1.0, 1.0, 3), 'bus'),
        (lambda: build_bus(M, 'mod_bus_6u', 2.263, 1.0, 3), 'bus'),
        (lambda: build_body_panel_1u(M), 'face'),
        (lambda: build_sband(M), 'face'),
        (lambda: build_dish(M), 'face'),
        (lambda: build_imager(M), 'face'),
        (lambda: build_radiometer(M), 'face'),
        (lambda: build_magnetometer(M), 'boom'),
        (lambda: build_battery(M), 'internal'),
        (lambda: build_computer(M), 'internal'),
        (lambda: build_adcs(M), 'internal'),
        (lambda: build_deployer(M), 'deployer'),
    ]
    parts = []
    for build, kind in builders:  # export each part before building the next (see export_glb)
        root = build()
        export_glb(root, root.name + '.glb', release_names=True)
        parts.append((root, kind))
    if FAST:
        return

    cam = studio(samples=20, res=(800, 600))
    roots = [r for r, _ in parts]
    for root, kind in parts:
        set_visible(roots, False)
        set_visible([root], True)
        direction = (1.0, -1.25, 0.6)
        if kind == 'face':
            root.location.z = 0.9
            root.rotation_euler = (math.radians(35), 0, math.radians(25))
            direction = (0.9, -1.0, 0.55)
        elif kind == 'boom':
            root.location.z = 0.5
            root.rotation_euler = (math.radians(90), 0, math.radians(25))
            next(o for o in root.children if o.name.endswith('/HINGE_boom')).rotation_euler.x = math.radians(-55)
            direction = (0.6, -1.0, 0.3)
        elif kind == 'internal':
            root.location.z = 0.45
            direction = (0.8, -1.0, 0.75)
        elif kind == 'deployer':
            next(o for o in root.children if o.name.endswith('/HINGE_door')).rotation_euler.y = math.radians(-70)
        frame(cam, [root], direction)
        render(root.name + '.png')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), 'p2_parts.blend'))


if __name__ == '__main__':
    main()
