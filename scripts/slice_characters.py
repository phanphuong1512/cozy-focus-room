import os
from collections import deque
import numpy as np
from PIL import Image

CANVAS_W = 180
CANVAS_H = 240
ANCHOR_Y = 234


def extract_components(sheet_path: str):
    arr = np.array(Image.open(sheet_path).convert("RGBA"))
    h, w = arr.shape[:2]

    # Mask faint grey watermark star in bottom-right corner
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    wm = (min_c >= 110) & ((max_c - min_c) <= 15)
    sub_wm = wm[625:, 1255:]
    arr[625:, 1255:][sub_wm] = [255, 255, 255, 255]

    # Border flood fill on white/near-white background
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    white = (min_c >= 232) & ((max_c - min_c) <= 18)

    vis = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        if white[0, x]:
            vis[0, x] = True
            q.append((0, x))
        if white[h - 1, x] and not vis[h - 1, x]:
            vis[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if white[y, 0] and not vis[y, 0]:
            vis[y, 0] = True
            q.append((y, 0))
        if white[y, w - 1] and not vis[y, w - 1]:
            vis[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        cy, cx = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and white[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    arr[vis, 3] = 0
    fg = ~vis
    cvis = np.zeros((h, w), dtype=bool)
    comps = []

    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and not cvis[sy, sx]:
                cq = deque([(sy, sx)])
                cvis[sy, sx] = True
                area = 0
                minx, miny, maxx, maxy = sx, sy, sx, sy
                while cq:
                    cy, cx = cq.popleft()
                    area += 1
                    if cx < minx:
                        minx = cx
                    if cx > maxx:
                        maxx = cx
                    if cy < miny:
                        miny = cy
                    if cy > maxy:
                        maxy = cy
                    for dy in (-2, -1, 0, 1, 2):
                        for dx in (-2, -1, 0, 1, 2):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not cvis[ny, nx]:
                                cvis[ny, nx] = True
                                cq.append((ny, nx))
                if area >= 800:
                    comps.append((minx, miny, maxx + 1, maxy + 1))

    full_img = Image.fromarray(arr, "RGBA")
    rows = {"r1": [], "r2": [], "r3": []}
    for box in comps:
        cy = (box[1] + box[3]) / 2.0
        spr = full_img.crop(box)
        if cy < 260:
            rows["r1"].append((box[0], spr))
        elif cy < 510:
            rows["r2"].append((box[0], spr))
        else:
            rows["r3"].append((box[0], spr))

    for k in rows:
        rows[k] = [item[1] for item in sorted(rows[k], key=lambda t: t[0])]
    return rows


def normalize_frame(spr: Image.Image) -> Image.Image:
    bbox = spr.getbbox()
    if bbox:
        spr = spr.crop(bbox)
    if spr.height > ANCHOR_Y:
        scale = ANCHOR_Y / float(spr.height)
        new_w = max(1, int(round(spr.width * scale)))
        spr = spr.resize((new_w, ANCHOR_Y), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    px = (CANVAS_W - spr.width) // 2
    py = ANCHOR_Y - spr.height
    canvas.paste(spr, (px, py), spr)
    return canvas


def flip_h(spr: Image.Image) -> Image.Image:
    return spr.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def save_avatar_portrait(idle_se_norm: Image.Image, out_path: str):
    # Crop head area from normalized 180x240 frame into square 120x120 portrait
    bbox = idle_se_norm.getbbox()
    if not bbox:
        return
    x0, y0, x1, _ = bbox
    cx = (x0 + x1) // 2
    head_size = 112
    left = max(0, cx - head_size // 2)
    top = max(0, y0 - 8)
    if left + head_size > CANVAS_W:
        left = CANVAS_W - head_size
    crop = idle_se_norm.crop((left, top, left + head_size, top + head_size))
    portrait = crop.resize((120, 120), Image.Resampling.NEAREST)
    portrait.save(out_path)


def main():
    os.makedirs("public/sprites/characters", exist_ok=True)
    all_ids = [f"c{i}" for i in range(1, 13)]
    all_rows = {}
    for cid in all_ids:
        all_rows[cid] = extract_components(f"assets/character/{cid}.png")

    flip_row2_set = {"c1", "c2", "c5"}

    for cid in all_ids:
        out_dir = f"public/sprites/characters/{cid}"
        os.makedirs(out_dir, exist_ok=True)
        r1 = all_rows[cid]["r1"]
        r2 = all_rows[cid]["r2"]
        r3 = all_rows[cid]["r3"]

        if cid in ("c1", "c2", "c3", "c4", "c5", "c6"):
            # Legacy v1 sheets: idle is first, walk is next 4
            idle_se = normalize_frame(r1[0])
            idle_se.save(f"{out_dir}/idle_se.png")
            save_avatar_portrait(idle_se, f"{out_dir}/avatar.png")

            for i in range(4):
                normalize_frame(r1[1 + i]).save(f"{out_dir}/walk_se_{i}.png")

            r2_proc = [flip_h(s) for s in r2] if cid in flip_row2_set else r2
            idle_nw = normalize_frame(r2_proc[0])
            idle_nw.save(f"{out_dir}/idle_nw.png")

            nw_indices = [1, 2, 3, 2] if cid == "c2" else [1, 2, 3, 4]
            for i, idx in enumerate(nw_indices):
                normalize_frame(r2_proc[idx]).save(f"{out_dir}/walk_nw_{i}.png")
        elif cid == "c7":
            # c7 has 7 frames in rows 1 & 2: [0..3]=walk, [5]=clean idle
            idle_se = normalize_frame(r1[5])
            idle_se.save(f"{out_dir}/idle_se.png")
            save_avatar_portrait(idle_se, f"{out_dir}/avatar.png")
            for i in range(4):
                normalize_frame(r1[i]).save(f"{out_dir}/walk_se_{i}.png")

            idle_nw = normalize_frame(r2[5])
            idle_nw.save(f"{out_dir}/idle_nw.png")
            for i in range(4):
                normalize_frame(r2[1 + i]).save(f"{out_dir}/walk_nw_{i}.png")
        else:
            # v2 sheets (c8..c12): 4 walk frames first, frame 5 (index 4) is idle
            idle_se = normalize_frame(r1[4])
            idle_se.save(f"{out_dir}/idle_se.png")
            save_avatar_portrait(idle_se, f"{out_dir}/avatar.png")
            for i in range(4):
                normalize_frame(r1[i]).save(f"{out_dir}/walk_se_{i}.png")

            idle_nw = normalize_frame(r2[4])
            idle_nw.save(f"{out_dir}/idle_nw.png")
            for i in range(4):
                normalize_frame(r2[i]).save(f"{out_dir}/walk_nw_{i}.png")

        # Row 3: Seated poses
        if cid == "c5":
            sit_typing_nw = normalize_frame(r3[0])
            sit_typing_se = normalize_frame(r3[2])
            sit_chill_se = normalize_frame(r3[3])
            sit_floor_se = normalize_frame(r3[4])
        elif cid == "c6":
            sit_typing_nw = normalize_frame(r3[1])
            sit_typing_se = normalize_frame(r3[0])
            sit_chill_se = normalize_frame(r3[2])
            sit_floor_se = normalize_frame(r3[3])
        elif cid == "c3":
            # c3: composite c3's NW back head onto c1's sit_typing_nw body
            sit_typing_se = normalize_frame(r3[0])
            sit_chill_se = normalize_frame(r3[2])
            sit_floor_se = normalize_frame(r3[3])

            c1_nw_body = normalize_frame(all_rows["c1"]["r3"][0])
            c3_nw_head = normalize_frame(r2[0])
            body_arr = np.array(c1_nw_body)
            head_arr = np.array(c3_nw_head)

            body_y0 = np.where(body_arr[:, :, 3] > 0)[0].min()
            head_y0 = np.where(head_arr[:, :, 3] > 0)[0].min()
            comp = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
            body_crop = c1_nw_body.crop((0, body_y0 + 112, CANVAS_W, CANVAS_H))
            comp.paste(body_crop, (0, body_y0 + 112), body_crop)
            head_crop = c3_nw_head.crop((0, head_y0, CANVAS_W, head_y0 + 122))
            comp.paste(head_crop, (-2, body_y0 - 4), head_crop)
            sit_typing_nw = comp
        else:
            # Standard Row 3 order: NW typing, SE typing, SE chill, SE floor
            sit_typing_nw = normalize_frame(r3[0])
            sit_typing_se = normalize_frame(r3[1])
            sit_chill_se = normalize_frame(r3[2])
            sit_floor_se = normalize_frame(r3[3])

        sit_typing_nw.save(f"{out_dir}/sit_typing_nw.png")
        sit_typing_se.save(f"{out_dir}/sit_typing_se.png")
        sit_chill_se.save(f"{out_dir}/sit_chill_se.png")
        sit_floor_se.save(f"{out_dir}/sit_floor_se.png")

        print(f"Exported 15 frames + avatar for {cid} -> {out_dir}")


if __name__ == "__main__":
    main()
