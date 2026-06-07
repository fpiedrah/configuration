# configuration

Personal dotfiles managed with GNU Stow.

This repo contains my daily shell, editor, terminal, and Hyprland desktop configuration.

## Included

- `nvim` - Neovim setup with `lazy.nvim` and plugin-based config
- `fish` - shell aliases, paths, and interactive shell settings
- `tmux` - custom prefix, pane navigation, and TPM plugins
- `kitty` - terminal settings and theme include
- `hypr` - Hyprland, Hyprpaper, and Hyprlock config
- `waybar` - top bar layout and modules
- `wofi` - launcher config
- `lsd` - `lsd` defaults

## Install

Each app is its own Stow package, with the in-package path mirroring `$HOME`
(e.g. `nvim/.config/nvim`). Clone the repo, then stow the packages you want.

```sh
git clone <your-repo-url> ~/configuration
cd ~/configuration
stow --target="$HOME" nvim fish tmux kitty hypr waybar wofi lsd
```

Stow one package at a time (`stow nvim`) or all of them at once
(`stow --target="$HOME" */`).

## Hyprland on a new machine

The Hyprland config is self-contained and portable:

- Monitors default to `monitor = , preferred, auto, 1`, which works on any display.
- The wallpaper ships in the repo (`hypr/.config/hypr/wallpaper.jpg`), referenced by a `~/.config` path.
- `hyprlock` is a minimal clock + password screen with no external scripts.

### Per-machine screen layout

Each machine's monitor/workspace layout lives in its own **committed** file under
`hypr/.config/hypr/hosts/` (e.g. `desktop.conf`, `laptop.conf`), so a wipe/reset restores
it straight from git. `hyprland.conf` always sources `hosts/active.conf`, which is a
**gitignored symlink** pointing at the current machine's file.

After `stow` on a machine, point `active.conf` at the right host file once:

```sh
ln -sf desktop.conf ~/.config/hypr/hosts/active.conf   # or laptop.conf, etc.
```

A new machine without a host file yet just uses the generic monitor default until
you add one.

## Notes

- This setup is primarily tailored for a Linux/Hyprland environment.
