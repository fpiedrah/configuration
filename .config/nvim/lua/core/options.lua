local g = vim.g       -- Global variables
local opt = vim.opt   -- Set options (global/buffer/window-scoped)

-- General
opt.clipboard = 'unnamedplus'                  -- Copy/paste to system clipboard
opt.swapfile = false                           -- Don't use a swapfile
opt.undofile = true                            -- Persist undo history across sessions
opt.mouse = 'a'                                 -- Enable mouse in all modes
opt.confirm = true                             -- Prompt instead of failing on unsaved changes
opt.completeopt = 'menuone,noinsert,noselect'  -- Autocomplete behaviour

-- Neovim UI
opt.number = true           -- Show absolute line number on the cursor line
opt.relativenumber = true   -- Show relative line numbers on other lines
opt.cursorline = true       -- Highlight the current line
opt.signcolumn = 'yes'      -- Always show the sign column to avoid text shifting
opt.scrolloff = 8           -- Keep lines of context above/below the cursor
opt.sidescrolloff = 8       -- Keep columns of context left/right of the cursor
opt.showmatch = true        -- Highlight matching parenthesis
opt.foldmethod = 'marker'   -- Fold on markers (default 'foldmarker')
opt.splitright = true       -- Open vertical splits to the right
opt.splitbelow = true       -- Open horizontal splits below
opt.ignorecase = true       -- Ignore case when searching
opt.smartcase = true        -- ...unless the pattern contains an uppercase letter
opt.linebreak = true        -- Wrap on word boundaries
opt.wrap = false            -- Don't wrap long lines by default
opt.termguicolors = true    -- Enable 24-bit RGB colors
opt.laststatus = 3          -- Single global statusline

-- Tabs, indent
opt.expandtab = true        -- Use spaces instead of tabs
opt.shiftwidth = 4          -- Indent by 4 spaces
opt.tabstop = 4             -- A tab counts as 4 spaces
opt.smartindent = true      -- Auto-indent new lines

-- Memory, CPU
opt.hidden = true           -- Allow background buffers
opt.history = 100           -- Remember N lines of command history
opt.synmaxcol = 240         -- Max column to apply syntax highlighting
opt.updatetime = 250        -- Faster CursorHold events / quicker diagnostics

-- Startup
opt.shortmess:append('sI')  -- Skip intro and search-count messages

-- Disable unused built-in plugins
local disabled_built_ins = {
  'netrw',
  'netrwPlugin',
  'netrwSettings',
  'netrwFileHandlers',
  'gzip',
  'zip',
  'zipPlugin',
  'tar',
  'tarPlugin',
  'getscript',
  'getscriptPlugin',
  'vimball',
  'vimballPlugin',
  '2html_plugin',
  'logipat',
  'rrhelper',
  'spellfile_plugin',
  'matchit',
}

for _, plugin in pairs(disabled_built_ins) do
  g['loaded_' .. plugin] = 1
end
