-- Keymap Helper
local function map(mode, lhs, rhs, desc)
  vim.keymap.set(mode, lhs, rhs, { silent = true, desc = desc })
end

-- Search
map('n', '<leader>c', '<cmd>nohlsearch<CR>', 'Clear Search Highlight')

-- Window Focus
map('n', '<leader>wh', '<C-w>h', 'Go to Left Window')
map('n', '<leader>wj', '<C-w>j', 'Go to Lower Window')
map('n', '<leader>wk', '<C-w>k', 'Go to Upper Window')
map('n', '<leader>wl', '<C-w>l', 'Go to Right Window')

-- Window Move
map('n', '<leader>wH', '<C-w>H', 'Move Window Left')
map('n', '<leader>wJ', '<C-w>J', 'Move Window Down')
map('n', '<leader>wK', '<C-w>K', 'Move Window Up')
map('n', '<leader>wL', '<C-w>L', 'Move Window Right')

-- Window Layout
map('n', '<leader>ws', '<C-w>s', 'Split Below')
map('n', '<leader>wv', '<C-w>v', 'Split Vertically')
map('n', '<leader>wt', '<cmd>vert term<CR>', 'Vertical Terminal Split')
map('n', '<leader>wq', '<C-w>q', 'Close Window')
map('n', '<leader>wf', '<C-w>_<C-w>|', 'Fullscreen Window')
map('n', '<leader>w=', '<C-w>=', 'Equalize Windows')

-- Files
map('n', '<leader>s', '<cmd>write<CR>', 'Save File')
map('n', '<leader>Q', '<cmd>qa<CR>', 'Quit All')

-- Terminal
map('n', '<leader>t', '<cmd>terminal<CR>', 'Open Terminal')
map('t', '<Esc>', '<C-\\><C-n>', 'Exit Terminal Mode')

-- Escape
map('i', 'fd', '<Esc>', 'Exit Insert Mode')
map('x', 'fd', '<Esc>', 'Exit Visual Mode')

-- Delete Word
map('i', '<C-BS>', '<C-w>', 'Delete Word Backward')
map('i', '<C-h>', '<C-w>', 'Delete Word Backward')
