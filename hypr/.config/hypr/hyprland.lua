-- Hyprland Config — https://wiki.hypr.land/

---- MONITORS ----
-- Generic Default, Per-Host in hosts/
hl.monitor({
    output   = "",
    mode     = "preferred",
    position = "auto",
    scale    = 1,
})

---- AUTOSTART ----
hl.on("hyprland.start", function()
    hl.exec_cmd("waybar & hyprpaper")
    hl.exec_cmd("dunst")
    hl.exec_cmd("wl-paste --watch cliphist store")
    hl.exec_cmd("lxpolkit")
end)

---- ENVIRONMENT ----
hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")

hl.config({
    cursor = {
        no_hardware_cursors = true,
        enable_hyprcursor   = true,
    },
})

---- LOOK & FEEL ----
hl.config({
    general = {
        gaps_in     = 4,
        gaps_out    = 20,
        border_size = 2,
        col = {
            active_border   = { colors = { "rgba(FFA07Aee)", "rgba(00ff99ee)" }, angle = 45 },
            inactive_border = "rgba(595959aa)",
        },
        layout = "dwindle",
    },

    decoration = {
        rounding = 10,

        blur = {
            enabled  = true,
            size     = 3,
            passes   = 1,
            vibrancy = 0.1696,
        },

        shadow = {
            enabled      = true,
            range        = 4,
            render_power = 3,
            color        = "rgba(1a1a1aee)",
        },
    },

    animations = {
        enabled = true,
    },

    dwindle = {
        preserve_split = true,
    },

    misc = {
        force_default_wallpaper = 0,
        disable_hyprland_logo   = true,
    },
})

---- INPUT ----
hl.config({
    input = {
        kb_layout    = "us",
        kb_variant   = "intl", -- Dead Keys
        follow_mouse = 1,
        sensitivity  = 0,

        touchpad = {
            natural_scroll = false,
        },
    },
})

---- LAYER RULES ----
hl.layer_rule({ match = { namespace = "wofi" }, blur = true, ignore_alpha = 0.5 })
hl.layer_rule({ match = { namespace = "hyprpicker" }, no_anim = true })
hl.layer_rule({ match = { namespace = "selection" }, no_anim = true })

---- KEYBINDINGS ----
local MODIFIER = "SUPER"

hl.bind(MODIFIER .. " + RETURN", hl.dsp.exec_cmd("kitty"))
hl.bind(MODIFIER .. " + SPACE", hl.dsp.exec_cmd("wofi --show drun"))
hl.bind(MODIFIER .. " + Q", hl.dsp.window.close())
hl.bind(MODIFIER .. " + F", hl.dsp.window.fullscreen({ mode = "maximized", action = "toggle" }))
hl.bind(MODIFIER .. " + Y", hl.dsp.exec_cmd("hyprshot --clipboard-only -m region"))
hl.bind(MODIFIER .. " + C", hl.dsp.exec_cmd("cliphist list | wofi --dmenu | cliphist decode | wl-copy"))
hl.bind(MODIFIER .. " + SHIFT + CTRL + L", hl.dsp.exec_cmd("hyprlock"))

-- Directions
local DIRECTION_KEYS = {
    { key = "H", direction = "left",  resize_x = -40, resize_y = 0 },
    { key = "J", direction = "down",  resize_x = 0,   resize_y = 40 },
    { key = "K", direction = "up",    resize_x = 0,   resize_y = -40 },
    { key = "L", direction = "right", resize_x = 40,  resize_y = 0 },
}

for _, binding in ipairs(DIRECTION_KEYS) do
    -- Move Focus
    hl.bind(MODIFIER .. " + " .. binding.key, hl.dsp.focus({ direction = binding.direction }))
    -- Move Window
    hl.bind(MODIFIER .. " + SHIFT + " .. binding.key, hl.dsp.window.move({ direction = binding.direction }))
    -- Resize Window
    hl.bind(
        MODIFIER .. " + CTRL + " .. binding.key,
        hl.dsp.window.resize({ x = binding.resize_x, y = binding.resize_y, relative = true }),
        { repeating = true }
    )
end

-- Workspaces
local WORKSPACE_KEYS = { "D", "T", "A", "R", "O", "S", "N", "P" }

for workspace, key in ipairs(WORKSPACE_KEYS) do
    -- Switch Workspace
    hl.bind(MODIFIER .. " + " .. key, hl.dsp.focus({ workspace = workspace }))
    -- Move Window to Workspace
    hl.bind(MODIFIER .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = workspace, follow = true }))
end

---- WINDOW RULES ----
hl.window_rule({ match = { class = ".*" }, suppress_event = "maximize" })
hl.window_rule({ match = { class = "^(dunst)$" }, float = true })
hl.window_rule({
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

-- Firefox Dialogs
local FIREFOX_DIALOG_TITLES = { "^(Picture-in-Picture)$", "^(Open File)$", "^(Save As...)$" }

for _, title in ipairs(FIREFOX_DIALOG_TITLES) do
    hl.window_rule({ match = { class = "^(firefox)$", title = title }, float = true })
end

---- HOST OVERRIDES ----
-- Per-Host Config, active.lua Links to hosts/<host>.lua
local host_loaded, host_error = pcall(require, "hosts/active")

if not host_loaded then
    print("No active host config: " .. tostring(host_error))
end
