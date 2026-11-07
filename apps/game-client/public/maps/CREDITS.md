# Map assets

All map assets are **CC0** (public domain) — no attribution required, credited here anyway.

## Props — Poly Haven (https://polyhaven.com, CC0)
Photo-scanned models, fetched as 1k glTF by `scripts/maps/fetch-polyhaven.py`
(textures ≤512 px JPEG, tangents dropped) and decimated with meshoptimizer by
`scripts/maps/simplify-glb.mjs` (≈1.1k tris small props, ≈2.6k large):

Barrel_01 Barrel_02 WetFloorSign_01 ammo_box barrel_03 cardboard_box_01 cement_bag chemistry_set concrete_road_barrier_02 covered_car dead_quiver_trunk dead_tree_trunk dead_tree_trunk_02 drawer_cabinet dry_branches_medium_01 exterior_aircon_unit fern_02 fire_hydrant industrial_pastic_container lifebuoy medical_box metal_jerrycan metal_office_desk metal_tool_chest metal_trash_can modular_industrial_pipes_01 ocean_buoy old_bed_frame old_military_crate old_tyre painted_wooden_bench plastic_crate_01 portable_generator portable_searchlight power_box_01 propane_tank rock_07 rock_09 security_light shrub_02 shrub_04 small_lpg_tank steel_frame_shelves_01 steel_frame_shelves_02 stone_fire_pit street_lamp_02 tool_cart trashbag tree_stump_01 utility_box_02 wheelchair_01 wooden_crate_01 wooden_crate_02 wooden_military_crate wooden_picnic_table worn_metal_rack 

## Surfaces — Poly Haven + ambientCG (https://ambientcg.com, CC0)
PBR sets (colour 1024, normal/roughness 512, WebP) fetched by `scripts/maps/fetch-textures.py`:

aerial_grass_rock asphalt_02 asphalt_snow brick_wall_10 brown_mud clay_roof_tiles coast_sand_01 concrete_floor_worn_001 concrete_wall_008 container_side corrugated_iron cracked_concrete damaged_plaster dark_wooden_planks dirty_tiles dry_ground_rocks factory_wall floor_tiles_06 forest_ground_04 forest_leaves_02 gravel_road grey_roof_01 hangar_concrete_floor hessian_230 metal_plate road_damaged rust_coarse_01 snow006 

`snow006` is ambientCG **Snow006**; everything else is the Poly Haven asset of the same name.
