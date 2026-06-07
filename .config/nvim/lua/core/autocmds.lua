local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

-- Use 2-space indentation for these filetypes.
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

-- Soft-wrap prose filetypes.
autocmd('FileType', {
  group = augroup('set_wrap', { clear = true }),
  pattern = { 'typst', 'markdown' },
  callback = function()
    vim.opt_local.wrap = true
  end,
})

-- Treat Nextflow scripts as Groovy.
autocmd({ 'BufRead', 'BufNewFile' }, {
  group = augroup('nextflow_filetype', { clear = true }),
  pattern = '*.nf',
  callback = function()
    vim.bo.filetype = 'groovy'
  end,
})

-- Briefly highlight text on yank.
autocmd('TextYankPost', {
  group = augroup('highlight_yank', { clear = true }),
  callback = function()
    (vim.hl or vim.highlight).on_yank()
  end,
})
