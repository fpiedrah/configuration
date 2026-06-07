-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'

-- vim.uv is the modern alias; fall back to vim.loop on older Neovim.
local uv = vim.uv or vim.loop
if not uv.fs_stat(lazypath) then
  vim.fn.system({
    'git',
    'clone',
    '--filter=blob:none',
    'https://github.com/folke/lazy.nvim.git',
    '--branch=stable',
    lazypath,
  })
end

vim.opt.rtp:prepend(lazypath)

require('lazy').setup('plugins', {
  -- Reload the UI when a plugin spec changes on disk.
  change_detection = { notify = false },
  -- Don't notify about updates on every startup.
  checker = { enabled = false },
})
