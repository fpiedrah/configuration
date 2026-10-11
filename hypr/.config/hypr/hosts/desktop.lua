-- Desktop Layout, Activate with:
--   ln -sf desktop.lua ~/.config/hypr/hosts/active.lua
hl.monitor({ output = "HDMI-A-1", mode = "2560x1440@59.95", position = "0x0", scale = 1, transform = 1 })
hl.monitor({ output = "DP-2", mode = "2560x1440@59.95", position = "1440x510", scale = 1 })

-- Workspace Monitors
local WORKSPACE_MONITORS = {
    ["DP-2"]     = { 1, 2, 3, 4 },
    ["HDMI-A-1"] = { 5, 6, 7, 8 },
}

for monitor, workspaces in pairs(WORKSPACE_MONITORS) do
    for _, workspace in ipairs(workspaces) do
        hl.workspace_rule({ workspace = tostring(workspace), monitor = monitor })
    end
end
