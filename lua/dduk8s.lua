local M = {}

function M.setDetail(enable)
	local currentOptions = vim.fn['ddu#custom#get_current'](vim.b.ddu_ui_name)
	local origSources = currentOptions.sources

	local namesOfSources = {}
	for _, origSource in ipairs(origSources) do
		if type(origSource) == 'table' then
			-- /
			-- Patching the params in sources(this would have more priority)
			-- /
			if origSource.params ~= nil and origSource.params.show_detail ~= nil then
				origSource.params.show_detail = enable
			end
			-- :~)

			table.insert(namesOfSources, origSource.name)
		else
			table.insert(namesOfSources, origSource)
		end
	end

	local sourceParams = {}

	for _, nameOfSource in ipairs(namesOfSources) do
		sourceParams[nameOfSource] = { show_detail = enable }
	end

	vim.fn['ddu#ui#do_action']('updateOptions',
		{
			sources = origSources,
			sourceParams = sourceParams,
		}
	)
end

function M.toggleDetail()
	local currentOptions = vim.fn['ddu#custom#get_current'](vim.b.ddu_ui_name)
	local origSources = currentOptions.sources

	local namesOfSources = {}

	-- /
	-- Builds the list of names in sources
	-- /
	for _, origSource in ipairs(origSources) do
		if type(origSource) == 'table' then
			-- /
			-- Patching the params in sources(this would have more priority)
			-- /
			if origSource.params ~= nil and origSource.params.show_detail ~= nil then
				origSource.params.show_detail = not origSource.params.show_detail
			end
			-- :~)

			table.insert(namesOfSources, origSource.name)
		else
			table.insert(namesOfSources, origSource)
		end
	end
	-- :~)

	local sourceParams = {}

	-- /
	-- Builds sourceParams for current sources
	-- /
	for _, nameOfSource in ipairs(namesOfSources) do
		local enable_detail = true -- inverse of default false

		local sourceParamOfCurrentSource = currentOptions.sourceParams[nameOfSource]

		if sourceParamOfCurrentSource["show_detail"] ~= nil then
			enable_detail = not sourceParamOfCurrentSource["show_detail"]
		end

		sourceParams[nameOfSource] = {
			show_detail = enable_detail
		}
	end
	-- :~)

	vim.fn['ddu#ui#do_action']('updateOptions',
		{
			sources = origSources,
			sourceParams = sourceParams,
		}
	)
end

return M
