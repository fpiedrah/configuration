local LAZY_DIRECTORY = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'

-- Bootstrap
if not vim.uv.fs_stat(LAZY_DIRECTORY) then
  local output = vim.fn.system({
    'git',
    'clone',
    '--filter=blob:none',
    '--branch=stable',
    'https://github.com/folke/lazy.nvim.git',
    LAZY_DIRECTORY,
  })
  if vim.v.shell_error ~= 0 then
    error('Failed to clone lazy.nvim:\n' .. output)
  end
end

vim.opt.rtp:prepend(LAZY_DIRECTORY)

require('lazy').setup('plugins', {
  change_detection = { notify = false },
  checker = { enabled = false },
  performance = {
    rtp = {
      disabled_plugins = {
        'gzip',
        'matchit',
        'netrwPlugin',
        'spellfile',
        'tarPlugin',
        'zipPlugin',
      },
    },
  },
})
