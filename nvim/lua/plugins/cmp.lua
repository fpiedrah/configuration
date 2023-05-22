local cmp = require('cmp')
local luasnip = require('luasnip')
local lspkind = require('lspkind')


cmp.setup {
  snippet = {
    expand = function(args)
      luasnip.lsp_expand(args.body)
    end,
  },

  completion = {
    keyword_length = 3
  },

  mapping = {
    ['<C-n>'] = cmp.mapping.select_next_item { behavior = cmp.SelectBehavior.Insert },
    ['<C-p>'] = cmp.mapping.select_prev_item { behavior = cmp.SelectBehavior.Insert },
    ['<C-d>'] = cmp.mapping.scroll_docs(-4),
    ['<C-f>'] = cmp.mapping.scroll_docs(4),
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<C-e>'] = cmp.mapping.abort(),
    ['<tab>'] = cmp.config.disable,
    ['<CR>'] = cmp.mapping.confirm {
      behavior = cmp.ConfirmBehavior.Replace,
      select = true,
    },
  },

  formatting = {
    format = lspkind.cmp_format {
      with_text = true,
      menu = {
        buffer = '[buf]',
        nvim_lsp = '[LSP]',
        nvim_lua = '[api]',
        path = '[path]',
        luasnip = '[snip]',
        gh_issues = '[issues]',
        tn = '[TabNine]',
      },
    },
  },

  experimental = {
    native_menu = false,
    ghost_text = true,
  },

  sources = {
    { name = 'nvim_lsp' },
    { name = 'luasnip' },
    { name = 'path' },
    { 
      name = 'buffer', 
      keyword_length = 5,
      max_item_count = 4,
    },
    {
      name = 'look',
      keyword_length = 5,
      max_item_count = 4,
      option = {
        convert_case = true,
        loud = true,
        dict = '/usr/share/dict/cracklib-small',
      }
    }
  },
}
