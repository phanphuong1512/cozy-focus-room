import os
from collections import deque
import numpy as np
from PIL import Image


def is_neutral_bg(arr: np.ndarray, min_val: int = 44) -> np.ndarray:
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    return (min_c >= min_val) & (max_c <= 95) & ((max_c - min_c) <= 10)


def flood_clear_bg(
    img: Image.Image,
    clean_pockets: bool = False,
    min_bg: int = 44,
    extra_seeds: list[tuple[int, int]] | None = None,
) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    h, w = arr.shape[:2]
    bg_mask = is_neutral_bg(arr, min_bg)

    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    for x in range(w):
        if bg_mask[0, x]:
            visited[0, x] = True
            q.append((0, x))
        if bg_mask[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if bg_mask[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            q.append((y, 0))
        if bg_mask[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            q.append((y, w - 1))

    if extra_seeds:
        for sx, sy in extra_seeds:
            if 0 <= sy < h and 0 <= sx < w and not visited[sy, sx] and bg_mask[sy, sx]:
                visited[sy, sx] = True
                q.append((sy, sx))

    while q:
        cy, cx = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and bg_mask[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    if clean_pockets:
        r = arr[:, :, 0].astype(np.int16)
        g = arr[:, :, 1].astype(np.int16)
        b = arr[:, :, 2].astype(np.int16)
        max_c = np.maximum(np.maximum(r, g), b)
        min_c = np.minimum(np.minimum(r, g), b)
        sheet_bg = (min_c >= 52) & (max_c <= 90) & ((max_c - min_c) <= 8)

        comp_visited = visited.copy()
        for sy in range(h):
            for sx in range(w):
                if not comp_visited[sy, sx] and sheet_bg[sy, sx]:
                    cq = deque([(sy, sx)])
                    comp_visited[sy, sx] = True
                    pixels = [(sy, sx)]
                    while cq:
                        cy, cx = cq.popleft()
                        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and not comp_visited[ny, nx] and sheet_bg[ny, nx]:
                                comp_visited[ny, nx] = True
                                cq.append((ny, nx))
                                pixels.append((ny, nx))
                    if len(pixels) >= 24:
                        for py, px in pixels:
                            visited[py, px] = True

    arr[visited, 3] = 0

    # Pass 2: Gently dissolve external 1px sheet grid-line whiskers adjacent to transparent bg
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    whisker_candidate = (min_c >= 26) & (max_c <= 105) & ((max_c - min_c) <= 14)

    for _ in range(3):
        alpha = arr[:, :, 3] == 0
        padded = np.pad(alpha, 1, constant_values=True)
        transparent_neighbors = (
            padded[:-2, :-2].astype(np.int8)
            + padded[:-2, 1:-1].astype(np.int8)
            + padded[:-2, 2:].astype(np.int8)
            + padded[1:-1, :-2].astype(np.int8)
            + padded[1:-1, 2:].astype(np.int8)
            + padded[2:, :-2].astype(np.int8)
            + padded[2:, 1:-1].astype(np.int8)
            + padded[2:, 2:].astype(np.int8)
        )
        drop = (~alpha) & whisker_candidate & (transparent_neighbors >= 5)
        arr[drop, 3] = 0

    out = Image.fromarray(arr, "RGBA")
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    return out


def slice_and_save(
    sheet: Image.Image,
    box: tuple[int, int, int, int],
    out_path: str,
    erase_boxes=None,
    clean_pockets: bool = False,
    min_bg: int = 44,
    extra_seeds: list[tuple[int, int]] | None = None,
):
    crop = sheet.crop(box).convert("RGBA")
    if erase_boxes:
        arr = np.array(crop)
        for ex0, ey0, ex1, ey1 in erase_boxes:
            rx0 = max(0, ex0 - box[0])
            ry0 = max(0, ey0 - box[1])
            rx1 = min(crop.width, ex1 - box[0])
            ry1 = min(crop.height, ey1 - box[1])
            if rx1 > rx0 and ry1 > ry0:
                arr[ry0:ry1, rx0:rx1] = [64, 64, 68, 255]
        crop = Image.fromarray(arr, "RGBA")

    clean = flood_clear_bg(
        crop,
        clean_pockets=clean_pockets,
        min_bg=min_bg,
        extra_seeds=extra_seeds,
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    clean.save(out_path)
    print(f"Saved {out_path} ({clean.width}x{clean.height})")


def build_iso_bathroom_tile(interior_sheet: Image.Image):
    # Clean marble swatch inside interior.png
    swatch = interior_sheet.crop((864, 518, 1068, 718)).convert("RGBA")
    sw, sh = swatch.size

    # Map isometric diamond (Top 125,0 -> Right 250,62 -> Bot 125,125 -> Left 0,62)
    # Using affine projection from 250x125 destination coordinates back to square swatch
    dst_w, dst_h = 250, 125
    dst_arr = np.zeros((dst_h, dst_w, 4), dtype=np.uint8)
    src_arr = np.array(swatch)

    for y in range(dst_h):
        for x in range(dst_w):
            # Normalized isometric grid coordinates (u, v) in [0, 1] around center (125, 62.5)
            nx = (x - dst_w / 2.0) / (dst_w / 2.0)
            ny = (y - dst_h / 2.0) / (dst_h / 2.0)
            u = (nx + ny) * 0.5 + 0.5
            v = (ny - nx) * 0.5 + 0.5
            sx = int(np.clip(u * (sw - 1), 0, sw - 1))
            sy = int(np.clip(v * (sh - 1), 0, sh - 1))
            dst_arr[y, x] = src_arr[sy, sx]

    # Apply exact diamond alpha channel of floor_wood_iso.png
    wood_ref = Image.open("public/sprites/tiles/floor_wood_iso.png").convert("RGBA")
    wood_alpha = np.array(wood_ref)[:, :, 3]
    dst_arr[:, :, 3] = wood_alpha

    tile_img = Image.fromarray(dst_arr, "RGBA")
    tile_img.save("public/sprites/tiles/floor_tiles.png")
    tile_img.save("public/sprites/bathroom/floor_tiles.png")
    print("Saved seamless 250x125 isometric bathroom floor_tiles.png")


def main():
    sheet0 = Image.open("assets/interior/interior.png")
    sheet2 = Image.open("assets/interior/interior2.png")
    sheet3 = Image.open("assets/interior/interior3.png")

    # Sheet 0: Bathroom
    s0_specs = [
        ((38, 102, 224, 304), "public/sprites/bathroom/vanity.png"),
        ((258, 102, 444, 304), "public/sprites/bathroom/vanity_soap.png"),
        ((532, 122, 658, 298), "public/sprites/bathroom/toilet_closed.png"),
        ((696, 122, 822, 298), "public/sprites/bathroom/toilet_open.png"),
        ((68, 372, 204, 476), "public/sprites/bathroom/washbasins.png"),
        ((296, 372, 384, 476), "public/sprites/bathroom/trash_bin.png"),
        ((576, 352, 718, 738), "public/sprites/bathroom/bathroom_door.png"),
        ((882, 112, 1028, 418), "public/sprites/bathroom/glass_partition.png"),
        ((1072, 102, 1168, 298), "public/sprites/bathroom/shower_set.png"),
        ((1082, 302, 1164, 408), "public/sprites/bathroom/shower_shelf.png"),
        ((1218, 132, 1344, 202), "public/sprites/bathroom/heat_lamp_off.png"),
        ((1218, 302, 1344, 372), "public/sprites/bathroom/heat_lamp_on.png"),
    ]
    for box, out in s0_specs:
        slice_and_save(sheet0, box, out)

    build_iso_bathroom_tile(sheet0)

    # Sheet 2: Workspace (mask text labels & overlapping chair area on double_desk)
    slice_and_save(
        sheet2,
        (45, 32, 508, 402),
        "public/sprites/workspace/double_desk.png",
        erase_boxes=[
            (45, 32, 360, 96),
            (360, 32, 508, 48),
            (405, 245, 508, 402),
            (340, 290, 508, 402),
            (150, 368, 508, 402),
        ],
        clean_pockets=False,
        min_bg=36,
        extra_seeds=[(55, 295), (420, 155), (215, 240)],
    )
    slice_and_save(sheet2, (68, 492, 218, 736), "public/sprites/workspace/chair_front.png", clean_pockets=False, min_bg=48)
    slice_and_save(sheet2, (252, 492, 392, 736), "public/sprites/workspace/chair_side.png", clean_pockets=False, min_bg=48)
    slice_and_save(sheet2, (438, 492, 578, 736), "public/sprites/workspace/chair_back.png", clean_pockets=False, min_bg=48)
    s2_specs = [
        ((724, 102, 996, 206), "public/sprites/workspace/monitors.png"),
        ((740, 210, 978, 314), "public/sprites/workspace/laptops.png"),
        ((744, 326, 946, 372), "public/sprites/workspace/mouse_keyboards.png"),
        ((1068, 102, 1208, 168), "public/sprites/workspace/ac_unit.png"),
        ((1074, 178, 1192, 242), "public/sprites/workspace/pegboard.png"),
        ((1208, 112, 1342, 238), "public/sprites/workspace/wire_grid.png"),
        ((1074, 278, 1326, 378), "public/sprites/workspace/hanging_decor.png"),
    ]
    for box, out in s2_specs:
        slice_and_save(sheet2, box, out)

    # Sheet 3: Kitchen (mask 'L-COUNTER' label at top-left without cutting upper cabinet)
    slice_and_save(
        sheet3,
        (524, 65, 984, 418),
        "public/sprites/kitchen/l_counter.png",
        erase_boxes=[(524, 65, 800, 96)],
        min_bg=32,
        extra_seeds=[(30, 50), (110, 45), (420, 25), (200, 320), (260, 320), (45, 330)],
    )
    s3_specs = [
        ((48, 514, 272, 738), "public/sprites/kitchen/stove_counter.png"),
        ((1016, 540, 1326, 718), "public/sprites/kitchen/kitchen_props.png"),
    ]
    for box, out in s3_specs:
        slice_and_save(sheet3, box, out, min_bg=40)


if __name__ == "__main__":
    main()
