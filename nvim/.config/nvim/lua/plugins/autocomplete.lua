return {
  'saghen/blink.cmp',
  version = '1.*',
  event = 'InsertEnter',
  dependencies = { 'L3MON4D3/LuaSnip', 'Kaiser-Yang/blink-cmp-dictionary' },
  opts = {
    keymap = {
      preset = 'enter',
      ['<C-d>'] = { 'scroll_documentation_up', 'fallback' },
    },
    completion = {
      documentation = { auto_show = true },
      ghost_text = { enabled = true },
    },
    snippets = { preset = 'luasnip' },
    sources = {
      default = { 'lsp', 'path', 'snippets', 'buffer', 'dictionary' },
      per_filetype = { lua = { inherit_defaults = true, 'lazydev' } },
      min_keyword_length = 3,
      providers = {
        lazydev = { name = 'LazyDev', module = 'lazydev.integrations.blink', score_offset = 100 },
        buffer = { min_keyword_length = 5, max_items = 4 },
        dictionary = {
          name = 'Dictionary',
          module = 'blink-cmp-dictionary',
          min_keyword_length = 5,
          max_items = 4,
          opts = { dictionary_files = { vim.fn.stdpath('config') .. '/dict/cracklib-small' } },
        },
      },
    },
  },
}
