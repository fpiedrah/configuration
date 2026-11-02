local opt = vim.opt

-- General
opt.clipboard = 'unnamedplus'
opt.swapfile = false
opt.undofile = true
opt.mouse = 'a'
opt.confirm = true

-- Interface
opt.number = true
opt.relativenumber = true
opt.cursorline = true
opt.signcolumn = 'yes'
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.showmatch = true
opt.foldmethod = 'marker'
opt.splitright = true
opt.splitbelow = true
opt.laststatus = 3

-- Search
opt.ignorecase = true
opt.smartcase = true

-- Wrapping
opt.wrap = false
opt.linebreak = true

-- Indentation
opt.expandtab = true
opt.shiftwidth = 4
opt.tabstop = 4

-- Performance
opt.synmaxcol = 240
opt.updatetime = 250

-- Messages
opt.shortmess:append('sI')

-- Filetypes
vim.filetype.add({ extension = { nf = 'groovy' } })
