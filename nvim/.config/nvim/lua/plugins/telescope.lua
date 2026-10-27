-- File Finders, First Executable Wins
local FINDERS = { 'fd', vim.fn.expand('~/.pi/agent/bin/fd'), 'fdfind' }

-- Find Command: hidden files shown, .gitignore respected unless opts.ignored
local function find_command(opts)
    local exclude = vim.list_extend({ '.git' }, opts.exclude or {})
    local command

    for _, finder in ipairs(FINDERS) do
        if vim.fn.executable(finder) == 1 then
            command = { finder, '--type', 'f', '--hidden', '--color', 'never' }
            if opts.ignored then table.insert(command, '--no-ignore') end
            for _, pattern in ipairs(exclude) do
                vim.list_extend(command, { '--exclude', pattern })
            end
            return command
        end
    end

    if vim.fn.executable('rg') == 1 then
        command = { 'rg', '--files', '--hidden', '--color', 'never' }
        if opts.ignored then table.insert(command, '--no-ignore') end
        for _, pattern in ipairs(exclude) do
            vim.list_extend(command, { '--glob', '!' .. pattern })
        end
        return command
    end

    command = { 'git', 'ls-files', '--cached', '--others' }
    if not opts.ignored then table.insert(command, '--exclude-standard') end
    table.insert(command, '--')
    for _, pattern in ipairs(exclude) do
        table.insert(command, ':(exclude,glob)**/' .. pattern .. '/**')
    end
    return command
end

local function configuration()
    local telescope = require('telescope')

    telescope.setup({
        pickers = {
            find_files = { find_command = find_command },
        },
    })

    telescope.load_extension('fzf')
end

return {
    'nvim-telescope/telescope.nvim',
    cmd = 'Telescope',
    dependencies = {
        'nvim-lua/plenary.nvim',
        'nvim-tree/nvim-web-devicons',
        { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
    },
    branch = 'master',
    config = configuration,
}
