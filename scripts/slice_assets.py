#!/usr/bin/env python3
"""
scripts/slice_assets.py
Automated sprite slicing & standardization pipeline for the 2D Apartment game.
Extracts clean RGBA sprites with transparent backgrounds, removes labels/text,
normalizes anchors to Bottom-Center (0.5, 1.0), and outputs assets/manifest.json.
"""

import os
import json
import numpy as np
from PIL import Image
from collections import deque

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIRS = [
    os.path.join(BASE_DIR, "assets", "sprites"),
    os.path.join(BASE_DIR, "public", "sprites")
]
MANIFEST_PATH = os.path.join(BASE_DIR, "assets", "manifest.json")

def remove_background(crop_rgb, sheet_type, name=None):
    """
    Remove dark background / checkerboard / slate from crop using
    color criteria and border flood-fill with 8-way connectivity.
    """
    arr = np.array(crop_rgb).copy()
    H, W, _ = arr.shape
    
    # Specific pre-masking for text labels inside known crops
    if name == "double_desk":
        # Clear 'DESK & CHAIRS' and '+ Double Desk' in top-left
        arr[:75, :330] = [65, 65, 67]
    elif name == "l_counter":
        # Clear top text 'L-COUNTER'
        arr[:15, :200] = [53, 58, 62]
    elif name == "chair_front":
        # Clear '+ Ergonomic Office Chairs' text if caught
        arr[:40, :] = [65, 65, 67]
        
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    sat = np.maximum(r, np.maximum(g, b)) - np.minimum(r, np.minimum(g, b))
    lum = (r + g + b) // 3
    
    if sheet_type == 'char1':
        # Flat neutral grey
        is_bg = (r >= 47) & (r <= 57) & (g >= 47) & (g <= 57) & (b >= 47) & (b <= 57) & (sat <= 3)
    elif sheet_type in ('char3', 'froggie2'):
        # Checkerboard neutral grey
        is_bg = (r >= 30) & (r <= 65) & (g >= 30) & (g <= 65) & (b >= 30) & (b <= 65) & (sat <= 4)
    elif sheet_type in ('char4', 'froggie3'):
        # UI / States background
        is_bg = (r >= 34) & (r <= 64) & (g >= 34) & (g <= 64) & (b >= 34) & (b <= 64) & (sat <= 4)
    elif sheet_type in ('interior', 'bathroom'):
        # Bathroom checkerboard
        is_bg = (r >= 35) & (r <= 85) & (g >= 35) & (g <= 85) & (b >= 35) & (b <= 85) & (sat <= 5)
    elif sheet_type == 'interior1':
        # Living room slate (pure bg is r<=48, g<=52, b<=57)
        is_slate = (sat <= 12) & (r <= 48) & (g <= 52) & (b <= 57) & (b >= r)
        is_bg = is_slate
    elif sheet_type == 'interior2':
        # Workspace dark grey / subtle grid
        is_bg = (sat <= 8) & (lum >= 45) & (lum <= 88)
    elif sheet_type == 'interior3':
        # Kitchen slate
        is_bg = (sat <= 14) & (r >= 18) & (r <= 68) & (g >= 22) & (g <= 72) & (b >= 28) & (b <= 76) & (b >= r)
    else:
        is_bg = (sat <= 6) & (lum >= 30) & (lum <= 80)
        
    # Check 1-pixel grid lines embedded in background
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not is_bg[y, x] and lum[y, x] < 22:
                # Vertical grid line between bg
                if (is_bg[y, x-1] and is_bg[y, x+1]) or (is_bg[y-1, x] and is_bg[y+1, x]):
                    is_bg[y, x] = True

    # Border flood fill (starts only at crop boundary)
    visited = np.zeros((H, W), dtype=bool)
    q = deque()
    for x in range(W):
        if is_bg[0, x]: q.append((0, x)); visited[0, x] = True
        if is_bg[H-1, x]: q.append((H-1, x)); visited[H-1, x] = True
    for y in range(H):
        if is_bg[y, 0]: q.append((y, 0)); visited[y, 0] = True
        if is_bg[y, W-1]: q.append((y, W-1)); visited[y, W-1] = True
        
    while q:
        cy, cx = q.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx] and is_bg[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))
                
    # Also clear dark grid intersections touching visited for sheets with grid
    if sheet_type in ('interior1', 'interior3'):
        grid_cand = (lum < 22) & (~visited)
        for y in range(H):
            for x in range(W):
                if grid_cand[y, x]:
                    n_count = 0
                    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H and 0 <= nx < W and visited[ny, nx]:
                            n_count += 1
                    if n_count >= 2:
                        visited[y, x] = True

    # Form RGBA image
    rgba = np.dstack([arr, np.where(visited, 0, 255).astype(np.uint8)])
    alpha = rgba[:, :, 3]
    
    # 8-connectivity component filter to remove isolated speckles < 15px
    vis_comp = np.zeros((H, W), dtype=bool)
    clean_alpha = np.zeros((H, W), dtype=np.uint8)
    neighbors = [(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)]
    
    components = []
    for y in range(H):
        for x in range(W):
            if alpha[y, x] > 0 and not vis_comp[y, x]:
                comp = []
                cq = deque([(y, x)])
                vis_comp[y, x] = True
                while cq:
                    py, px = cq.popleft()
                    comp.append((py, px))
                    for dy, dx in neighbors:
                        ny, nx = py + dy, px + dx
                        if 0 <= ny < H and 0 <= nx < W and not vis_comp[ny, nx] and alpha[ny, nx] > 0:
                            vis_comp[ny, nx] = True
                            cq.append((ny, nx))
                components.append(comp)
                
    # Keep components with size >= 15
    for c in components:
        if len(c) >= 15:
            for py, px in c:
                clean_alpha[py, px] = 255
                
    rgba[:, :, 3] = clean_alpha
    
    # Auto crop to non-zero alpha bounding box
    y_idx, x_idx = np.where(clean_alpha > 0)
    if len(y_idx) == 0:
        return Image.fromarray(rgba), (0, 0, W, H)
    
    y1, y2 = y_idx.min(), y_idx.max() + 1
    x1, x2 = x_idx.min(), x_idx.max() + 1
    cropped = rgba[y1:y2, x1:x2]
    return Image.fromarray(cropped), (int(x1), int(y1), int(x2 - x1), int(y2 - y1))


# Asset definitions mapping (category, sprite_name, sheet_path, sheet_type, (x1, y1, x2, y2), scale_down_factor)
SPRITE_SPECS = [
    # --- 1. CHARACTER (assets/froggie/character_sheet_1.png: 2752x1536) ---
    ("character", "froggie_front", "assets/froggie/character_sheet_1.png", "char1", (69, 140, 466, 987), 0.5),
    ("character", "froggie_left", "assets/froggie/character_sheet_1.png", "char1", (481, 140, 850, 987), 0.5),
    ("character", "froggie_right", "assets/froggie/character_sheet_1.png", "char1", (894, 140, 1245, 987), 0.5),
    ("character", "froggie_back", "assets/froggie/character_sheet_1.png", "char1", (1302, 140, 1703, 987), 0.5),
    ("character", "froggie_variant_skirt", "assets/froggie/character_sheet_1.png", "char1", (1937, 136, 2362, 803), 0.5),
    ("character", "froggie_variant_pants", "assets/froggie/character_sheet_1.png", "char1", (1937, 859, 2362, 1457), 0.5),
    ("character", "face_neutral", "assets/froggie/character_sheet_1.png", "char1", (69, 1105, 466, 1453), 0.5),
    ("character", "face_happy", "assets/froggie/character_sheet_1.png", "char1", (481, 1105, 850, 1453), 0.5),
    ("character", "face_surprised", "assets/froggie/character_sheet_1.png", "char1", (894, 1105, 1245, 1453), 0.5),
    ("character", "face_wink", "assets/froggie/character_sheet_1.png", "char1", (1302, 1105, 1703, 1453), 0.5),
    ("character", "item_glasses", "assets/froggie/character_sheet_1.png", "char1", (2384, 170, 2673, 290), 0.5),
    ("character", "item_blouse", "assets/froggie/character_sheet_1.png", "char1", (2384, 345, 2673, 565), 0.5),
    ("character", "item_dress", "assets/froggie/character_sheet_1.png", "char1", (2384, 610, 2673, 945), 0.5),
    ("character", "item_cap", "assets/froggie/character_sheet_1.png", "char1", (2384, 1005, 2673, 1165), 0.5),
    ("character", "item_gift_box_big", "assets/froggie/character_sheet_1.png", "char1", (2384, 1230, 2673, 1455), 0.5),

    # --- 2. DIALOGUE PORTRAITS (assets/froggie/froggie2.png: 1376x768) ---
    ("character", "portrait_happy", "assets/froggie/froggie2.png", "froggie2", (40, 80, 240, 365), 1.0),
    ("character", "portrait_sad", "assets/froggie/froggie2.png", "froggie2", (263, 80, 460, 365), 1.0),
    ("character", "portrait_angry", "assets/froggie/froggie2.png", "froggie2", (486, 80, 683, 365), 1.0),
    ("character", "portrait_surprised", "assets/froggie/froggie2.png", "froggie2", (707, 80, 907, 365), 1.0),
    ("character", "portrait_confused", "assets/froggie/froggie2.png", "froggie2", (931, 80, 1127, 365), 1.0),
    ("character", "portrait_shy", "assets/froggie/froggie2.png", "froggie2", (1149, 80, 1348, 365), 1.0),

    # Mouth Visemes & Eyes
    ("character", "mouth_closed", "assets/froggie/froggie2.png", "froggie2", (40, 620, 145, 690), 1.0),
    ("character", "mouth_smile", "assets/froggie/froggie2.png", "froggie2", (598, 620, 703, 690), 1.0),
    ("character", "mouth_pout", "assets/froggie/froggie2.png", "froggie2", (708, 620, 817, 690), 1.0),
    ("character", "eyes_open", "assets/froggie/froggie2.png", "froggie2", (868, 590, 978, 700), 1.0),
    ("character", "eyes_half", "assets/froggie/froggie2.png", "froggie2", (991, 590, 1100, 700), 1.0),
    ("character", "eyes_closed", "assets/froggie/froggie2.png", "froggie2", (1110, 590, 1220, 700), 1.0),
    ("character", "eyes_wink", "assets/froggie/froggie2.png", "froggie2", (1236, 590, 1345, 700), 1.0),

    # --- 3. STATES, PROPS & VFX (assets/froggie/froggie3.png: 1376x768) ---
    ("character", "froggie_selected", "assets/froggie/froggie3.png", "froggie3", (44, 100, 240, 460), 1.0),
    ("character", "froggie_inactive", "assets/froggie/froggie3.png", "froggie3", (270, 100, 450, 460), 1.0),
    ("character", "froggie_damaged", "assets/froggie/froggie3.png", "froggie3", (45, 500, 240, 765), 1.0),
    ("character", "froggie_buff", "assets/froggie/froggie3.png", "froggie3", (240, 500, 470, 765), 1.0),
    ("character", "prop_gift_box", "assets/froggie/froggie3.png", "froggie3", (770, 100, 930, 280), 1.0),
    ("character", "prop_phone", "assets/froggie/froggie3.png", "froggie3", (955, 100, 1045, 280), 1.0),
    ("character", "prop_glasses", "assets/froggie/froggie3.png", "froggie3", (1065, 120, 1215, 260), 1.0),
    ("character", "prop_bunny_heart", "assets/froggie/froggie3.png", "froggie3", (1230, 100, 1315, 280), 1.0),
    ("ui_vfx", "vfx_dust_cloud", "assets/froggie/froggie3.png", "froggie3", (760, 450, 930, 580), 1.0),
    ("ui_vfx", "vfx_landing_splash", "assets/froggie/froggie3.png", "froggie3", (950, 480, 1150, 580), 1.0),
    ("ui_vfx", "vfx_hearts_stars", "assets/froggie/froggie3.png", "froggie3", (1170, 460, 1330, 580), 1.0),
    ("ui_vfx", "hud_avatar_open", "assets/froggie/froggie3.png", "froggie3", (750, 620, 1010, 740), 1.0),
    ("ui_vfx", "hud_avatar_wink", "assets/froggie/froggie3.png", "froggie3", (1020, 620, 1320, 740), 1.0),

    # --- 4. LIVING ROOM (assets/interior/interior1.png: 1376x768) ---
    ("living_room", "sofa_straight", "assets/interior/interior1.png", "interior1", (260, 30, 510, 165), 1.0),
    ("living_room", "sofa_iso", "assets/interior/interior1.png", "interior1", (540, 30, 770, 205), 1.0),
    ("living_room", "table_glass_round_1", "assets/interior/interior1.png", "interior1", (830, 60, 960, 205), 1.0),
    ("living_room", "table_glass_round_2", "assets/interior/interior1.png", "interior1", (1000, 60, 1130, 205), 1.0),
    ("living_room", "cabinet_tall", "assets/interior/interior1.png", "interior1", (270, 230, 410, 400), 1.0),
    ("living_room", "cabinet_shoes", "assets/interior/interior1.png", "interior1", (440, 320, 580, 400), 1.0),
    ("living_room", "altar", "assets/interior/interior1.png", "interior1", (630, 260, 800, 400), 1.0),
    ("living_room", "door_closed", "assets/interior/interior1.png", "interior1", (280, 420, 395, 600), 1.0),
    ("living_room", "door_open_in", "assets/interior/interior1.png", "interior1", (450, 420, 565, 600), 1.0),
    ("living_room", "door_open_out", "assets/interior/interior1.png", "interior1", (620, 420, 735, 600), 1.0),
    ("living_room", "door_frame", "assets/interior/interior1.png", "interior1", (795, 420, 915, 600), 1.0),
    ("living_room", "window_curtains", "assets/interior/interior1.png", "interior1", (970, 420, 1175, 600), 1.0),
    ("living_room", "sunburst_clock", "assets/interior/interior1.png", "interior1", (270, 620, 400, 755), 1.0),
    ("living_room", "metal_shelf", "assets/interior/interior1.png", "interior1", (440, 610, 540, 755), 1.0),
    ("living_room", "watermelon_mat", "assets/interior/interior1.png", "interior1", (570, 640, 720, 755), 1.0),
    ("living_room", "sneakers", "assets/interior/interior1.png", "interior1", (745, 620, 830, 755), 1.0),
    ("living_room", "floor_wood_iso", "assets/interior/interior1.png", "interior1", (850, 630, 1105, 755), 1.0),
    ("living_room", "sparkle_star", "assets/interior/interior1.png", "interior1", (1220, 630, 1290, 720), 1.0),

    # --- 5. WORKSPACE (assets/interior/interior2.png: 1376x768) ---
    ("workspace", "double_desk", "assets/interior/interior2.png", "interior2", (35, 45, 515, 438), 1.0),
    ("workspace", "chair_front", "assets/interior/interior2.png", "interior2", (65, 630, 225, 760), 1.0),
    ("workspace", "chair_side", "assets/interior/interior2.png", "interior2", (250, 630, 395, 760), 1.0),
    ("workspace", "chair_back", "assets/interior/interior2.png", "interior2", (430, 630, 580, 760), 1.0),
    ("workspace", "monitors", "assets/interior/interior2.png", "interior2", (710, 130, 995, 270), 1.0),
    ("workspace", "laptops", "assets/interior/interior2.png", "interior2", (725, 275, 985, 420), 1.0),
    ("workspace", "mouse_keyboards", "assets/interior/interior2.png", "interior2", (725, 420, 1010, 500), 1.0),
    ("workspace", "ac_unit", "assets/interior/interior2.png", "interior2", (1050, 130, 1195, 220), 1.0),
    ("workspace", "pegboard", "assets/interior/interior2.png", "interior2", (1060, 225, 1185, 320), 1.0),
    ("workspace", "wire_grid", "assets/interior/interior2.png", "interior2", (1195, 150, 1335, 305), 1.0),
    ("workspace", "hanging_decor", "assets/interior/interior2.png", "interior2", (1060, 370, 1330, 490), 1.0),
    ("workspace", "floor_clutter", "assets/interior/interior2.png", "interior2", (700, 520, 1175, 760), 1.0),
    ("workspace", "altar_iso", "assets/interior/interior2.png", "interior2", (1165, 520, 1345, 760), 1.0),

    # --- 6. KITCHEN (assets/interior/interior3.png: 1376x768) ---
    ("kitchen", "fridge_closed", "assets/interior/interior3.png", "interior3", (50, 130, 225, 510), 1.0),
    ("kitchen", "fridge_open", "assets/interior/interior3.png", "interior3", (240, 150, 480, 510), 1.0),
    ("kitchen", "l_counter", "assets/interior/interior3.png", "interior3", (520, 112, 980, 434), 1.0),
    ("kitchen", "upper_cabinets", "assets/interior/interior3.png", "interior3", (1020, 70, 1340, 360), 1.0),
    ("kitchen", "range_hood_straight", "assets/interior/interior3.png", "interior3", (1060, 400, 1280, 530), 1.0),
    ("kitchen", "stove_counter", "assets/interior/interior3.png", "interior3", (50, 570, 280, 755), 1.0),
    ("kitchen", "range_hood_iso", "assets/interior/interior3.png", "interior3", (310, 580, 520, 755), 1.0),
    ("kitchen", "window_closed", "assets/interior/interior3.png", "interior3", (540, 570, 715, 755), 1.0),
    ("kitchen", "window_half_open", "assets/interior/interior3.png", "interior3", (730, 570, 925, 755), 1.0),
    ("kitchen", "kitchen_props", "assets/interior/interior3.png", "interior3", (1000, 590, 1340, 755), 1.0),

    # --- 7. BATHROOM (assets/interior/interior.png: 1376x768) ---
    ("bathroom", "vanity", "assets/interior/interior.png", "bathroom", (40, 140, 225, 400), 1.0),
    ("bathroom", "vanity_soap", "assets/interior/interior.png", "bathroom", (255, 140, 440, 400), 1.0),
    ("bathroom", "washbasins", "assets/interior/interior.png", "bathroom", (65, 500, 205, 625), 1.0),
    ("bathroom", "trash_bin", "assets/interior/interior.png", "bathroom", (290, 500, 385, 625), 1.0),
    ("bathroom", "toilet_closed", "assets/interior/interior.png", "bathroom", (530, 170, 660, 380), 1.0),
    ("bathroom", "toilet_open", "assets/interior/interior.png", "bathroom", (690, 170, 820, 380), 1.0),
    ("bathroom", "bathroom_door", "assets/interior/interior.png", "bathroom", (570, 470, 715, 760), 1.0),
    ("bathroom", "glass_partition", "assets/interior/interior.png", "bathroom", (870, 150, 1020, 535), 1.0),
    ("bathroom", "shower_set", "assets/interior/interior.png", "bathroom", (1055, 140, 1165, 380), 1.0),
    ("bathroom", "shower_shelf", "assets/interior/interior.png", "bathroom", (1065, 390, 1160, 525), 1.0),
    ("bathroom", "heat_lamp_off", "assets/interior/interior.png", "bathroom", (1200, 170, 1335, 260), 1.0),
    ("bathroom", "heat_lamp_on", "assets/interior/interior.png", "bathroom", (1200, 390, 1335, 490), 1.0),
    ("bathroom", "floor_tiles", "assets/interior/interior.png", "bathroom", (850, 640, 1060, 765), 1.0),
    ("bathroom", "wall_tiles", "assets/interior/interior.png", "bathroom", (1120, 640, 1330, 765), 1.0),
]

def main():
    print("=== STARTING ASSET SLICING PIPELINE ===")
    
    # Cache sheet images
    sheet_cache = {}
    
    manifest = {
        "version": "1.0",
        "description": "Clean sliced sprites for Kaplay 2D Cozy Apartment game",
        "defaultPivot": {"x": 0.5, "y": 1.0},
        "sprites": {}
    }
    
    # Ensure all output directories exist
    for out_dir in OUTPUT_DIRS:
        for cat in ["character", "living_room", "workspace", "kitchen", "bathroom", "ui_vfx"]:
            os.makedirs(os.path.join(out_dir, cat), exist_ok=True)
            
    total = len(SPRITE_SPECS)
    for idx, (cat, name, sheet_rel, sheet_type, box, scale_factor) in enumerate(SPRITE_SPECS, 1):
        sheet_path = os.path.join(BASE_DIR, sheet_rel)
        if sheet_path not in sheet_cache:
            if not os.path.exists(sheet_path):
                print(f"ERROR: Sheet not found: {sheet_path}")
                continue
            sheet_cache[sheet_path] = Image.open(sheet_path).convert("RGB")
            
        full_img = sheet_cache[sheet_path]
        crop_rgb = full_img.crop(box)
        
        # Remove background & crop
        clean_img, local_bbox = remove_background(crop_rgb, sheet_type, name)
        
        # Scale if required (NEAREST filter for crisp pixel art!)
        if scale_factor != 1.0:
            new_w = max(1, int(round(clean_img.width * scale_factor)))
            new_h = max(1, int(round(clean_img.height * scale_factor)))
            clean_img = clean_img.resize((new_w, new_h), resample=Image.NEAREST)
            
        # Save to both output dirs
        rel_path = f"{cat}/{name}.png"
        for out_dir in OUTPUT_DIRS:
            save_path = os.path.join(out_dir, cat, f"{name}.png")
            clean_img.save(save_path, "PNG")
            
        manifest["sprites"][name] = {
            "category": cat,
            "path": f"/sprites/{rel_path}",
            "width": clean_img.width,
            "height": clean_img.height,
            "pivot": {"x": 0.5, "y": 1.0},
            "sourceSheet": sheet_rel,
            "sourceBox": list(box),
            "scale": scale_factor
        }
        
        print(f"[{idx:2d}/{total:2d}] Sliced {cat}/{name}.png ({clean_img.width}x{clean_img.height})")
        
    # Write manifest
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest successfully written to {MANIFEST_PATH}")
    print(f"Total sliced sprites: {len(manifest['sprites'])}")
    print("=== SLICING PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
