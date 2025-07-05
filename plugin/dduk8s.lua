if vim.g.loaded_ddu_k8s and not vim.g.reload_ddu_k8s then
	return
end

vim.g.loaded_ddu_k8s = true

-- if vim.g.reload_ddu_k8s then
-- end

do
	local supportedKind = {
		pod = 'pods',
		service = 'services',
		deployment = 'deployments',
		secret = 'secrets',
		node = 'nodes',
	}
	local function performK8sOpen(resourceInfo)
		if not vim.fn.exists("*k8s#kubectl") then
			return false
		end

		if supportedKind[resourceInfo.kind] ~= nil then
			local k8sResource = supportedKind[resourceInfo.kind]

			local namespaceQueryParam = ""
			if resourceInfo.namespace then
				namespaceQueryParam = "&namespace=" .. resourceInfo.namespace
			end

			local k8sUrl = string.format(
				'k8s://%s/yaml?name=%s%s',
				k8sResource,
				resourceInfo.name, namespaceQueryParam
			)

			vim.cmd.edit(k8sUrl)
			vim.cmd.doautocmd("BufReadCmd")

			return true;
		end

		return false
	end

	local function performGetYaml(resourceInfo)
		vim.bo.filetype = "yaml"
		vim.bo.buftype = "nofile"

		if resourceInfo.namespace ~= nil then
			vim.cmd(string.format(
				'0read !kubectl --namespace %s get %s/%s -o yaml',
				resourceInfo.namespace, resourceInfo.kind, resourceInfo.name
			));

			return
		end

		vim.cmd(string.format(
			'0read !kubectl get %s/%s -o yaml',
			resourceInfo.kind, resourceInfo.name
		));
	end

	vim.api.nvim_create_augroup("ddu-k8s", { clear = true })
	vim.api.nvim_create_autocmd(
		"BufReadCmd",
		{
			group = "ddu-k8s",
			pattern = "dduk8s://?*",
			callback = function()
				local bufname = vim.fn.bufname()
				local matchedPartsOfResource = vim.fn.matchlist(
					bufname, '\\v^dduk8s://%((.+)\\.ns/)?([^/]+)/([^/]+)'
				)

				if #matchedPartsOfResource == 0 then
					vim.notify("Invalid resource path", vim.log.levels.ERROR, {})
					return
				end

				local resourceInfo = {}
				if (matchedPartsOfResource[2] ~= "") then
					resourceInfo.namespace = matchedPartsOfResource[2]
				end

				resourceInfo.kind = vim.fn.tolower(matchedPartsOfResource[3])
				resourceInfo.name = matchedPartsOfResource[4]

				if not performK8sOpen(resourceInfo) then
					performGetYaml(resourceInfo)
				end
			end
		}
	)
end

local function dduK8s(cmdContext)
	local context = nil
	local namespace = nil
	local type = nil
	local selector = nil
	local showDetail = false

	for _, argv in ipairs(cmdContext.fargs) do
		if not vim.startswith(argv, '-') then
			type = argv
			goto CONTINUE
		end

		local matchOption = vim.fn.matchlist(argv, [[\v-(l|c|ns|d)%(\=(\S+))?]])

		if #matchOption == 0 then
			vim.notify(string.format("Invalid option: %s", argv), vim.log.levels.ERROR, {})
			return
		end

		if matchOption[2] == "ns" then
			namespace = matchOption[3]
			if namespace == "" then
				vim.notify("Namespace is missed(by '-ns=)", vim.log.levels.ERROR, {})
			end
		elseif matchOption[2] == "c" then
			context = matchOption[3]
			if context == "" then
				vim.notify("Context is missed(by '-c=')", vim.log.levels.ERROR, {})
				return
			end
		elseif matchOption[2] == "d" then
			showDetail = true
		elseif matchOption[2] == "l" then
			selector = matchOption[3]
			if selector == "" then
				vim.notify("Selector is missed(by '-l=)", vim.log.levels.ERROR, {})
			end
		end

		::CONTINUE::
	end

	if type == nil then
		vim.notify("Kind(pod, service, etc.) is required", vim.log.levels.ERROR, {})
		return
	end

	local dduSourceParamOfK8s = {}

	if namespace ~= nil then
		dduSourceParamOfK8s['namespace'] = namespace
	end

	if context ~= nil then
		dduSourceParamOfK8s['context'] = context
	end

	if showDetail then
		dduSourceParamOfK8s['show_detail'] = true
	end

	if selector ~= nil then
		dduSourceParamOfK8s['selector'] = selector
	end

	-- Start DDU for K8S objects
	-- /

	if type == "po" then
		type = "pod"
	elseif type == "deploy" then
		type = "deployment"
	elseif type == "rs" then
		type = "replicaset"
	elseif type == "sts" then
		type = "statefulset"
	elseif type == "ds" then
		type = "daemonset"
	elseif type == "cj" then
		type = "cronjob"
	elseif type == "cm" then
		type = "configmap"
	elseif type == "svc" then
		type = "service"
	elseif type == "pvc" then
		type = "persistentvolumeclaim"
	elseif type == "pv" then
		type = "persistentvolume"
	end

	local dduSourceName = 'k8s_' .. vim.fn.tolower(type)
	vim.fn['ddu#start']({
		name = dduSourceName,
		sources = { dduSourceName },
		sourceParams = {
			[dduSourceName] = dduSourceParamOfK8s
		},
	})
end

local function dduK8sCompletion(argLead, cmdLine, _)
	local kindOfObjects = {
		"pod", "po", "deployment", "deploy", "service", "svc", "replicaSet", "rs", "statefulSet", "sts",
		"namespace", "context", "daemonSet", "ds", "cronJob", "cj", "job", "endpointSlice",
		"configMap", "cm", "secret", "persistentVolume", "pv", "persistentVolumeClaim", "pvc",
		"node",
	}
	local options = { "-c=", "-ns=", "-d", "-l=" }

	if argLead == "" then
		return kindOfObjects
	end

	local args = vim.split(argLead, "%s+", {})

	-- /
	-- Completion of kinds for K8S objects
	-- /
	if args[1]:sub(1, 1) ~= "-" then
		return vim.tbl_filter(
			function(kind)
				return vim.startswith(kind, args[1])
			end,
			kindOfObjects
		)
	end
	-- :~)

	local function processCandidatesOfOption(optionName, values, checkingPrefix)
		return vim.iter(values)
			:map(
				function(v)
					return optionName .. v
				end
			)
			:filter(
				function(v)
					return vim.startswith(v, checkingPrefix)
				end
			)
			:totable()
	end

	local candidates = {}

	-- /
	-- Completion of options
	-- /
	if vim.startswith(args[1], '-c=') then
		local execResult = vim.system(
			{'kubectl', 'config', 'get-contexts', '--no-headers=true', '-o', 'name' },
			{ text = true }
		):wait()

		if execResult.code ~= 0 then
			vim.notify(string.format("Failed to get contexts[%d]: %s", execResult.code, execResult.stderr))
			return {}
		end

		candidates = processCandidatesOfOption('-c=', vim.split(vim.trim(execResult.stdout), '\n'), args[1])
	elseif vim.startswith(args[1], '-ns=') then
		local patternForContext = '%-c=([^%s]+)'
		local onTheFlyContext = vim.iter(cmdLine:gmatch(patternForContext)):next()

		local kubectlArgs = { 'kubectl', 'get', 'namespaces', '--no-headers=true', '-o', 'custom-columns=name:metadata.name' }
		if onTheFlyContext ~= nil  then
			table.insert(kubectlArgs, '--context')
			table.insert(kubectlArgs, onTheFlyContext)
		end

		local execResult = vim.system(
			kubectlArgs, { text = true }
		):wait()

		if execResult.code ~= 0 then
			vim.notify(string.format("Failed to get namespaces[%d]: %s", execResult.code, execResult.stderr))
			return {}
		end

		candidates = processCandidatesOfOption('-ns=', vim.split(vim.trim(execResult.stdout), '\n'), args[1])
	else
		candidates = vim.tbl_filter(
			function(option)
				return string.find(option, args[1], 1, true) == 1
			end,
			options
		)
	end
	-- :~)

	return candidates
end

-- DduK8s <kind> [options...]
--
-- Options:
-- -c=<> - The context of kubectl
-- -ns=<> - The namespace of kubernetes
-- -l=<> - Feeds to -l if the kubectl resource supported selector(by labels)
-- -d - show detail
vim.api.nvim_create_user_command(
	'DduK8s', dduK8s,
	{
		nargs= '+',
		complete = dduK8sCompletion,
		desc = "Use DDU to brower K8S resources",
	}
)
