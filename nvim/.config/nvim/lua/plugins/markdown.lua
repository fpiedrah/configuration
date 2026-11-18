local DISABLED = { enabled = false }

local function show_markup()
  for _, language in ipairs({ 'markdown', 'markdown_inline' }) do
    local query = vim.treesitter.query.get(language, 'highlights')

    for pattern, directives in pairs(query and query.info.patterns or {}) do
      for _, directive in ipairs(directives) do
        local hides = directive[2] == 'conceal' or directive[2] == 'conceal_lines'
        if directive[1] == 'set!' and hides then
          query.query:disable_pattern(pattern)
        end
      end
    end
  end
end

local function table_at(buffer, row)
  local ok, node = pcall(vim.treesitter.get_node, { bufnr = buffer, pos = { row, 0 } })
  while ok and node and node:type() ~= 'pipe_table' do
    node = node:parent()
  end

  if not (ok and node) then
    return nil
  end

  local first, _, last, column = node:range()
  return { first, column == 0 and last - 1 or last }
end

local function reveal_whole_tables()
  local updater = require('render-markdown.core.ui').updater
  local hidden = updater.hidden

  function updater:hidden()
    local range = hidden(self)
    if not range or range[1] ~= range[2] then
      return range
    end

    return table_at(self.buf, range[1]) or range
  end
end

return {
  'MeanderingProgrammer/render-markdown.nvim',
  ft = { 'markdown' },
  dependencies = { 'nvim-treesitter/nvim-treesitter' },
  opts = {
    latex = { position = 'replace' },

    pipe_table = { border_virtual = true },

    anti_conceal = { ignore = { virtual_lines = false } },

    heading = DISABLED,
    paragraph = DISABLED,
    code = DISABLED,
    dash = DISABLED,
    document = DISABLED,
    bullet = DISABLED,
    checkbox = DISABLED,
    quote = DISABLED,
    link = DISABLED,
    sign = DISABLED,
    inline_highlight = DISABLED,
    html = DISABLED,
    yaml = DISABLED,
  },
  config = function(_, opts)
    require('render-markdown').setup(opts)
    show_markup()
    reveal_whole_tables()
  end,
}
