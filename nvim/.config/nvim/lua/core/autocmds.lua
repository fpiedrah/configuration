local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

-- 2-Space Indentation
autocmd('FileType', {
  group = augroup('set_indent', { clear = true }),
  pattern = {
    'xml',
    'html',
    'xhtml',
    'css',
    'scss',
    'javascript',
    'typescript',
    'yaml',
    'groovy',
    'typst',
    'lua',
  },
  callback = function()
    vim.opt_local.shiftwidth = 2
    vim.opt_local.tabstop = 2
  end,
})

-- Soft-Wrap Prose
autocmd('FileType', {
  group = augroup('set_wrap', { clear = true }),
  pattern = { 'typst' },
  callback = function()
    vim.opt_local.wrap = true
  end,
})

-- Highlight on Yank
autocmd('TextYankPost', {
  group = augroup('highlight_yank', { clear = true }),
  callback = function()
    vim.hl.on_yank()
  end,
})
