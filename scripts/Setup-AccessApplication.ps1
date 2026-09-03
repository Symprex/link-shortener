<#
.SYNOPSIS
  Creates or updates the Worker-level Cloudflare Access application that
  protects the link-shortener-admin Worker in its entirety. Idempotent: safe
  to run repeatedly.

.DESCRIPTION
  Under D21, /admin moved to its own Worker (link-shortener-admin, see
  wrangler.admin.jsonc) and no longer verifies a JWT itself: it trusts
  ctx.access, populated by Cloudflare Access enforcing at the edge before the
  Worker runs. This script is what wires that enforcement up. It creates a
  self-hosted Access application whose destination is the admin Worker
  itself (type "worker", or "preview_worker" with -PreviewOnly), which
  Cloudflare's own docs describe as covering every route, custom domain,
  workers.dev hostname AND preview URL of that Worker
  (https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker).

  DANGER — this must never be pointed at link-shortener-redirect. Worker-level
  Access is all-or-nothing: applied to the redirect Worker it would put every
  short link in the company behind a login prompt. The default -WorkerName is
  the admin Worker, and this script refuses outright if -WorkerName is ever
  set to the redirect Worker's name, so that mistake cannot happen by
  accident.

  Nothing here reads or writes an AUD tag or a team domain. That existed only
  for the hand-written JWT verifier (src/access.ts) that D21 deleted; the
  audience is now enforced entirely by Access at the edge, and this script
  writes to no wrangler config.

  Runs on every deploy in CI (.github/workflows/deploy-worker.yml), with no
  explicit -AllowEmail/-AllowEmailDomain/-AllowGroupName/-AllowGroupId/
  -AllowReusablePolicyId, so the allow rule comes from
  access/admin-policy.jsonc via -PolicyPath. That makes the Access
  configuration declarative and drift-correcting: every deploy reasserts the
  policy declared in git, rather than the application being a one-off manual
  step nobody revisits. An engineer running this by hand with an explicit
  parameter still bypasses the file entirely, for a one-off change that is not
  meant to be committed.

.PARAMETER AccountId
  Cloudflare account id. Defaults to the Symprex account.

.PARAMETER WorkerName
  Name of the Worker to protect. Defaults to the admin Worker. Refuses if set
  to the redirect Worker's name.

.PARAMETER ApplicationName
  Name of the Access application, used to find it again on a re-run.

.PARAMETER PreviewOnly
  Protect only preview deployments (destination type preview_worker) rather
  than production and preview together (type worker, the default).

.PARAMETER AllowEmail
  One or more individual email addresses to admit. Takes precedence over
  -PolicyPath: if any of -AllowEmail, -AllowEmailDomain, -AllowGroupName,
  -AllowGroupId or -AllowReusablePolicyId is given, the policy file is not
  read at all.

.PARAMETER AllowEmailDomain
  Admit any address at this domain, e.g. symprex.com. Broadest option; use
  deliberately. Takes precedence over -PolicyPath (see -AllowEmail).

.PARAMETER AllowGroupName
  Name of an existing Access group to admit. Resolved to its id. Takes
  precedence over -PolicyPath (see -AllowEmail).

.PARAMETER AllowGroupId
  Id of an existing Access group to admit, given directly rather than
  resolved from a name. A plain id does not say on its own whether it names a
  group or a reusable policy (see -AllowReusablePolicyId), so this script
  verifies it against the account's Access groups before using it, and fails
  naming what the id turned out to be if it is not one. Takes precedence over
  -PolicyPath (see -AllowEmail).

.PARAMETER AllowReusablePolicyId
  Id of an existing *reusable* Access policy to admit whoever that policy
  already admits. A reusable policy is a separate Cloudflare resource from a
  group, attached to an application by id in its `policies` array rather than
  folded into an inline policy — this script builds that reference form, not
  an inline one. Verified against the account's reusable policies before use,
  the same way -AllowGroupId is verified. Takes precedence over -PolicyPath
  (see -AllowEmail).

.PARAMETER PolicyPath
  Path to a JSONC file declaring the allow rule (see access/admin-policy.jsonc
  for the documented shape: emailDomain, emails, groupName, groupId or
  reusablePolicyId). Read only when none of -AllowEmail, -AllowEmailDomain,
  -AllowGroupName, -AllowGroupId or -AllowReusablePolicyId is given — this is
  the path CI takes, so the allow rule lives in git and changes by pull
  request. Defaults to access/admin-policy.jsonc beside this script's repo.

.PARAMETER SessionDuration
  How long a session lasts before reauthentication. Default 24h.

.EXAMPLE
  $env:CF_ACCESS_API_TOKEN = '...'
  ./scripts/Setup-AccessApplication.ps1 -AllowEmailDomain symprex.com

.EXAMPLE
  ./scripts/Setup-AccessApplication.ps1 -AllowEmail adb@symprex.com -WhatIf

.EXAMPLE
  # An id whose resource type is not known in advance; the script verifies it.
  $env:CF_ACCESS_API_TOKEN = '...'
  ./scripts/Setup-AccessApplication.ps1 -AllowGroupId 904af598-75e5-4ec0-9bc2-8a5ed6dfec0f

.EXAMPLE
  # CI's usage: no explicit allow rule, so it comes from access/admin-policy.jsonc.
  $env:CF_ACCESS_API_TOKEN = '...'
  ./scripts/Setup-AccessApplication.ps1

.NOTES
  Requires a Cloudflare API token in $env:CF_ACCESS_API_TOKEN with:
    Account > Access: Apps and Policies > Edit
    Account > Access: Organizations, Identity Providers, and Groups > Read
    Account > Workers Scripts > Read        (to resolve the Worker's id)
  The Groups/Identity Providers > Read scope is still needed even though
  -AllowGroupId/-AllowReusablePolicyId/the file's groupId/reusablePolicyId
  take an id rather than a name: the id is ambiguous between an Access group
  and a reusable policy, so this script reads both the account's Access
  groups and its reusable policies to verify which one the id names before
  using it. That verification call could be skipped to shrink the token's
  scope, but only by trusting the id's assumed shape unchecked — exactly the
  mistake this script exists to catch before it silently produces a broken or
  over-permissive application, so it is not skipped.
  A `wrangler login` OAuth session carries no Zero Trust scopes and cannot be
  used for these calls. Create the token at
  https://dash.cloudflare.com/profile/api-tokens
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $AccountId = '93686db668e1fd06177661df08f7c0cd',
    [string] $WorkerName = 'link-shortener-admin',
    [string] $ApplicationName = 'Link shortener admin',
    [switch] $PreviewOnly,
    [string[]] $AllowEmail = @(),
    [string] $AllowEmailDomain,
    [string] $AllowGroupName,
    [string] $AllowGroupId,
    [string] $AllowReusablePolicyId,
    [string] $PolicyPath = (Join-Path $PSScriptRoot '..\access\admin-policy.jsonc'),
    [string] $SessionDuration = '24h'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ApiBase = 'https://api.cloudflare.com/client/v4'

# The one Worker this application must never protect. Worker-level Access is
# all-or-nothing, so pointing it here would put every short link behind a
# login. Not a parameter: a parameter could be overridden away from the very
# check it exists to enforce.
$script:RedirectWorkerName = 'link-shortener-redirect'

function Write-Step { param([string] $Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string] $Message) Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Info { param([string] $Message) Write-Host "        $Message" -ForegroundColor DarkGray }
function Write-Warn { param([string] $Message) Write-Host "    !   $Message" -ForegroundColor Yellow }

function Read-PolicyFile {
    <#
      Reads the allow rule out of a JSONC policy file (see
      access/admin-policy.jsonc for the documented shape). Deliberately minimal:
      strips only whole-line "// ..." comments — a line whose first non-
      whitespace characters are "//" — which is all that file itself uses. This
      is not a general JSONC parser and must not be pressed into service as one.

      Returns $null if the file does not exist, so the caller can fall through
      to the "no allow rule given" guard rather than treating a missing file as
      an error in itself — a repository need not carry a policy file for the
      engineer-facing, parameter-driven use to keep working.
    #>
    param([Parameter(Mandatory)] [string] $Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    $stripped = ($raw -split "`r?`n" | Where-Object { $_.TrimStart() -notmatch '^//' }) -join "`n"

    try {
        return $stripped | ConvertFrom-Json
    }
    catch {
        throw "Failed to parse policy file '$Path' as JSON once whole-line comments are stripped: $($_.Exception.Message)"
    }
}

function Stop-WithGuidance {
    <#
      Prerequisite failures are instructions for a person, not stack traces.
      `throw` collapses a here-string into one mangled line with a caret
      diagram, which buries the very guidance being given — so print it and
      exit instead.
    #>
    param(
        [Parameter(Mandatory)] [string] $Problem,
        [string] $Guidance
    )
    Write-Host ''
    Write-Host "FAILED: $Problem" -ForegroundColor Red
    if ($Guidance) {
        Write-Host ''
        foreach ($line in ($Guidance -split "`r?`n")) { Write-Host $line -ForegroundColor Yellow }
    }
    Write-Host ''
    exit 1
}

function Find-ByProperty {
    <#
      Filter a Cloudflare API result collection on one property, skipping any
      element that does not carry it.

      Set-StrictMode -Version Latest turns a missing property into a thrown
      error rather than $null, and these collections are heterogeneous: an
      account's Access applications carry hostname destinations with no
      worker_id, and nothing guarantees every element of any listing has every
      field. Reading them directly inside a Where-Object worked against small
      test data and failed against a real account with 41 applications. This is
      the second time that class of bug reached a run, so it is fixed in one
      place rather than at each call site.
    #>
    param(
        [AllowNull()] $Items,
        [Parameter(Mandatory)] [string] $Property,
        [Parameter(Mandatory)] [AllowEmptyString()] [string] $Value
    )
    if (-not $Items) { return @() }
    return @(@($Items) | Where-Object {
        ($null -ne $_) -and
        ($_ -is [pscustomobject]) -and
        ($_.PSObject.Properties.Name -contains $Property) -and
        ($_.$Property -eq $Value)
    })
}

function Get-SafeProperty {
    <#
      Read one property off an API object, or return $Fallback when it is
      absent — same strict-mode reason as Find-ByProperty. Used for values that
      only ever reach human-readable output, so a missing field should degrade
      the message rather than crash the run.
    #>
    param(
        [AllowNull()] $Object,
        [Parameter(Mandatory)] [string] $Property,
        [string] $Fallback = '(unnamed)'
    )
    if ($null -eq $Object) { return $Fallback }
    if (-not ($Object -is [pscustomobject])) { return $Fallback }
    if ($Object.PSObject.Properties.Name -notcontains $Property) { return $Fallback }
    $value = $Object.$Property
    if ($null -eq $value -or ($value -is [string] -and [string]::IsNullOrWhiteSpace($value))) { return $Fallback }
    return $value
}

function Invoke-CfApi {
    <#
      Wraps Invoke-RestMethod so Cloudflare's own error array surfaces as a
      readable message. Invoke-RestMethod throws on 4xx with the body hidden,
      and the body is the only place Cloudflare says what was actually wrong.
    #>
    param(
        [Parameter(Mandatory)] [string] $Method,
        [Parameter(Mandatory)] [string] $Path,
        [object] $Body,
        [switch] $AllowFailure
    )

    $uri = "$script:ApiBase$Path"
    $headers = @{
        Authorization = "Bearer $script:Token"
        'Content-Type' = 'application/json'
    }

    try {
        $params = @{ Method = $Method; Uri = $uri; Headers = $headers }
        if ($null -ne $Body) {
            $params['Body'] = ($Body | ConvertTo-Json -Depth 12 -Compress)
        }
        return Invoke-RestMethod @params
    }
    catch {
        # PowerShell 7 throws with an HttpResponseMessage, which has no
        # GetResponseStream(), and Invoke-RestMethod has already consumed the
        # body. The body survives on $_.ErrorDetails.Message — that is the only
        # place Cloudflare's own error array can still be read.
        $detail = $null
        $raw = $_.ErrorDetails.Message
        if ($raw) {
            try {
                $parsed = $raw | ConvertFrom-Json
                $hasErrors = ($parsed -is [pscustomobject]) -and
                             ($parsed.PSObject.Properties.Name -contains 'errors') -and
                             $parsed.errors
                if ($hasErrors) {
                    $detail = ($parsed.errors | ForEach-Object { "[$($_.code)] $($_.message)" }) -join '; '
                }
                else { $detail = $raw }
            }
            catch { $detail = $raw }
        }
        if (-not $detail) { $detail = $_.Exception.Message }

        if ($AllowFailure) { return [pscustomobject]@{ success = $false; errorDetail = $detail } }
        throw "$Method $Path failed: $detail"
    }
}

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------

Write-Step 'Checking prerequisites'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    Stop-WithGuidance -Problem "PowerShell 7 or later is required (found $($PSVersionTable.PSVersion))." `
        -Guidance 'Run this in pwsh, not Windows PowerShell.'
}
Write-Ok "PowerShell $($PSVersionTable.PSVersion)"

# The one Worker this application must never protect, checked before anything
# else calls the API. Worker-level Access is all-or-nothing: pointed at the
# redirect Worker, every short link in the company would demand a login.
if ($WorkerName -eq $script:RedirectWorkerName) {
    Stop-WithGuidance -Problem "-WorkerName is set to '$script:RedirectWorkerName', the redirect Worker." -Guidance @"
Worker-level Access protects every route, custom domain, workers.dev hostname
and preview of the Worker it is applied to. Pointed at $script:RedirectWorkerName,
that means every company short link would demand a login before redirecting.

This script protects the admin Worker only. Leave -WorkerName unset (it
defaults to link-shortener-admin), or pass the admin Worker's name explicitly.
"@
}
Write-Ok "Protecting Worker: $WorkerName"

$script:Token = $env:CF_ACCESS_API_TOKEN
if ([string]::IsNullOrWhiteSpace($script:Token)) {
    Stop-WithGuidance -Problem 'CF_ACCESS_API_TOKEN is not set.' -Guidance @'
Create an API token at https://dash.cloudflare.com/profile/api-tokens with:
    Account > Access: Apps and Policies > Edit
    Account > Access: Organizations, Identity Providers, and Groups > Read
    Account > Workers Scripts > Read

Then, in this shell:
    $env:CF_ACCESS_API_TOKEN = '<token>'

A `wrangler login` session cannot be used: its OAuth token carries no Zero
Trust scopes, so every Access call below would return 403.
'@
}
Write-Ok 'CF_ACCESS_API_TOKEN is set'

# An allow rule may come from an explicit parameter (the engineer-facing path)
# or, when none is given, from the policy file (the path CI takes, per
# access/admin-policy.jsonc). Explicit parameters win outright — if any is
# set, the policy file is not read at all — so nothing here has to reconcile
# the two.
$policySource = 'command-line parameters'
if ($AllowEmail.Count -eq 0 -and -not $AllowEmailDomain -and -not $AllowGroupName -and
    -not $AllowGroupId -and -not $AllowReusablePolicyId) {
    $filePolicy = Read-PolicyFile -Path $PolicyPath
    if ($filePolicy) {
        $policySource = $PolicyPath
        if (($filePolicy.PSObject.Properties.Name -contains 'emails') -and $filePolicy.emails) {
            $AllowEmail = @($filePolicy.emails)
        }
        if (($filePolicy.PSObject.Properties.Name -contains 'emailDomain') -and $filePolicy.emailDomain) {
            $AllowEmailDomain = $filePolicy.emailDomain
        }
        if (($filePolicy.PSObject.Properties.Name -contains 'groupName') -and $filePolicy.groupName) {
            $AllowGroupName = $filePolicy.groupName
        }
        if (($filePolicy.PSObject.Properties.Name -contains 'groupId') -and $filePolicy.groupId) {
            $AllowGroupId = $filePolicy.groupId
        }
        if (($filePolicy.PSObject.Properties.Name -contains 'reusablePolicyId') -and $filePolicy.reusablePolicyId) {
            $AllowReusablePolicyId = $filePolicy.reusablePolicyId
        }
    }
}

# Exactly one policy basis must be given (from a parameter or the file above).
# Admitting nobody would create an application that locks the engineer out;
# admitting everybody is never what was intended. Neither default is safe, so
# require the choice — this guard fires just as it always did, whichever
# source was consulted.
$policyBases = @()
if ($AllowEmail.Count -gt 0) { $policyBases += 'AllowEmail' }
if ($AllowEmailDomain) { $policyBases += 'AllowEmailDomain' }
if ($AllowGroupName) { $policyBases += 'AllowGroupName' }
if ($AllowGroupId) { $policyBases += 'AllowGroupId' }
if ($AllowReusablePolicyId) { $policyBases += 'AllowReusablePolicyId' }

if ($policyBases.Count -eq 0) {
    Stop-WithGuidance -Problem 'No allow rule given, so this would create an application that admits nobody.' -Guidance @"
Choose one, either as a parameter or in the policy file ($PolicyPath):
    -AllowEmailDomain symprex.com              any address at the domain
    -AllowEmail adb@symprex.com,other@x.com    named individuals
    -AllowGroupName "Staff"                    an existing Access group, by name
    -AllowGroupId "<uuid>"                     an existing Access group, by id
    -AllowReusablePolicyId "<uuid>"            an existing reusable Access policy, by id
"@
}
Write-Ok "Allow rule basis: $($policyBases -join ', ') (from $policySource)"

# ---------------------------------------------------------------------------
# 2. Token validity and permissions
# ---------------------------------------------------------------------------

Write-Step 'Verifying token permissions'

$apps = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/apps" -AllowFailure
if (-not $apps.success) {
    Stop-WithGuidance -Problem "Cannot list Access applications for account $AccountId." -Guidance @"
$($apps.errorDetail)

This usually means the token lacks 'Access: Apps and Policies > Edit', or it is
scoped to a different account. Check the token at
https://dash.cloudflare.com/profile/api-tokens
"@
}
Write-Ok "Token can read Access applications ($($apps.result.Count) existing)"

# ---------------------------------------------------------------------------
# 3. Zero Trust organisation must already exist
# ---------------------------------------------------------------------------

Write-Step 'Checking the Zero Trust organisation'

$org = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/organizations" -AllowFailure
if (-not $org.success -or -not $org.result) {
    Stop-WithGuidance -Problem "No Zero Trust organisation is provisioned for account $AccountId." -Guidance @"
$(if ($org.errorDetail) { $org.errorDetail })

An Access application cannot exist without one. Create the organisation once, in
the dashboard: Zero Trust > Settings > Custom Pages, or complete the Zero Trust
onboarding, which assigns the team domain. Then re-run this script.
"@
}

# Guarded rather than dereferenced directly: under Set-StrictMode -Version
# Latest, reading a missing property throws a raw engine error that would
# replace the actionable message below.
$authDomain = $null
if (($org.result -is [pscustomobject]) -and ($org.result.PSObject.Properties.Name -contains 'auth_domain')) {
    $authDomain = $org.result.auth_domain
}
if ([string]::IsNullOrWhiteSpace($authDomain)) {
    Stop-WithGuidance -Problem "The Zero Trust organisation for account $AccountId returned no team domain." -Guidance @'
Check Zero Trust > Settings in the dashboard and confirm the organisation is
fully provisioned with a team domain before re-running.
'@
}
Write-Ok "Team domain: $authDomain"

# ---------------------------------------------------------------------------
# 4. Resolve the Worker's id
# ---------------------------------------------------------------------------

Write-Step 'Resolving the Worker id'

# A Worker-level Access destination takes worker_id, an opaque id such as
# c81a2d22c29840ed9d61681a3270dbff — not the Worker's name — per
# https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker.
# That id is the "tag" field ("the immutable ID of the script") on each entry
# returned by GET /accounts/{account_id}/workers/scripts; the "id" field on
# the same entry is the script's *name*, confirmed against Cloudflare's own
# documented example response
# (https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/),
# where "id": "my-workers-script" sits beside "tag": "e8f70fdbc8b1fb0b8ddb1af166186758" —
# the same 32-hex-character shape as the worker_id example above. There is no
# per-name lookup endpoint that returns this id directly, so the full list is
# fetched and matched by name.
$scripts = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/workers/scripts" -AllowFailure
if (-not $scripts.success) {
    Stop-WithGuidance -Problem "Cannot list Workers scripts for account $AccountId." -Guidance @"
$($scripts.errorDetail)

This usually means the token lacks 'Workers Scripts > Read'. Check the token at
https://dash.cloudflare.com/profile/api-tokens
"@
}

$matchingScripts = Find-ByProperty -Items $scripts.result -Property 'id' -Value $WorkerName
if ($matchingScripts.Count -eq 0) {
    $available = (@($scripts.result) | ForEach-Object { Get-SafeProperty -Object $_ -Property 'id' }) -join ', '
    Stop-WithGuidance -Problem "No Worker named '$WorkerName' exists in account $AccountId." -Guidance @"
Deploy it first:
    pnpm exec wrangler deploy -c wrangler.admin.jsonc

Workers currently in this account: $available
"@
}
if ($matchingScripts.Count -gt 1) {
    throw "Found more than one Worker named '$WorkerName'. This should not be possible; check the account."
}
$workerId = $matchingScripts[0].tag
if ([string]::IsNullOrWhiteSpace($workerId)) {
    throw "Worker '$WorkerName' was found but returned no tag (immutable id). Check it in the dashboard before continuing."
}
Write-Ok "Worker id: $workerId"

# ---------------------------------------------------------------------------
# 5. Build the allow policy
# ---------------------------------------------------------------------------

Write-Step 'Building the allow policy'

$include = @()
$reusablePolicyIds = @()
foreach ($addr in $AllowEmail) {
    $include += @{ email = @{ email = $addr } }
    Write-Info "admit email $addr"
}
if ($AllowEmailDomain) {
    $include += @{ email_domain = @{ domain = $AllowEmailDomain } }
    Write-Info "admit any address at $AllowEmailDomain"
}
if ($AllowGroupName) {
    $groups = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/groups" -AllowFailure
    if (-not $groups.success) {
        Stop-WithGuidance -Problem "Could not list Access groups to resolve '$AllowGroupName'." -Guidance @"
$($groups.errorDetail)

The token needs 'Access: Organizations, Identity Providers, and Groups > Read'
(or the narrower 'Access: Groups > Read').
"@
    }
    $match = Find-ByProperty -Items $groups.result -Property 'name' -Value $AllowGroupName
    if (-not $match) {
        $available = (@($groups.result) | ForEach-Object { Get-SafeProperty -Object $_ -Property 'name' }) -join ', '
        throw "No Access group named '$AllowGroupName'. Available: $available"
    }
    if (@($match).Count -gt 1) {
        throw "More than one Access group is named '$AllowGroupName'. Rename one, or use -AllowEmail instead."
    }
    $matchId = Get-SafeProperty -Object (@($match)[0]) -Property 'id' -Fallback ''
    if (-not $matchId) { Stop-WithGuidance -Problem "Access group '$AllowGroupName' was found but carries no id." }
    $include += @{ group = @{ id = $matchId } }
    Write-Info "admit group '$AllowGroupName' ($matchId)"
}
if ($AllowGroupId) {
    # A plain id does not say on its own whether it names an Access group or a
    # reusable policy — the two are different Cloudflare resources, referenced
    # differently in an application (group: inline `include` rule; reusable
    # policy: an entry in the application's own `policies` array). Verify
    # against groups first, since -AllowGroupId/the file's groupId declares
    # that assumption; fall back to reusable policies only to give a precise
    # "wrong key" failure rather than a silent misconfiguration.
    $groups = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/groups" -AllowFailure
    if (-not $groups.success) {
        Stop-WithGuidance -Problem "Could not list Access groups to verify '$AllowGroupId'." -Guidance @"
$($groups.errorDetail)

The token needs 'Access: Organizations, Identity Providers, and Groups > Read'
(or the narrower 'Access: Groups > Read').
"@
    }
    $groupMatch = Find-ByProperty -Items $groups.result -Property 'id' -Value $AllowGroupId
    if ($groupMatch) {
        $include += @{ group = @{ id = $AllowGroupId } }
        Write-Info "admit group '$(Get-SafeProperty -Object (@($groupMatch)[0]) -Property 'name')' ($AllowGroupId)"
    }
    else {
        $reusablePolicies = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/policies" -AllowFailure
        if (-not $reusablePolicies.success) {
            Stop-WithGuidance -Problem "'$AllowGroupId' is not an Access group in account $AccountId, and reusable policies could not be listed to check it further." -Guidance @"
$($reusablePolicies.errorDetail)

The token needs 'Access: Apps and Policies > Edit' (which also covers reading
reusable policies) to check whether the id names one instead.
"@
        }
        $policyMatch = Find-ByProperty -Items $reusablePolicies.result -Property 'id' -Value $AllowGroupId
        if ($policyMatch) {
            Stop-WithGuidance -Problem "'$AllowGroupId' is a reusable Access policy ('$(Get-SafeProperty -Object (@($policyMatch)[0]) -Property 'name')'), not an Access group." -Guidance @'
Use -AllowReusablePolicyId instead of -AllowGroupId (or, in the policy file,
the "reusablePolicyId" key instead of "groupId").
'@
        }
        throw "No Access group or reusable policy with id '$AllowGroupId' exists in account $AccountId."
    }
}
if ($AllowReusablePolicyId) {
    $reusablePolicies = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/policies" -AllowFailure
    if (-not $reusablePolicies.success) {
        Stop-WithGuidance -Problem "Could not list reusable Access policies to verify '$AllowReusablePolicyId'." -Guidance @"
$($reusablePolicies.errorDetail)

The token needs 'Access: Apps and Policies > Edit' (which also covers reading
reusable policies).
"@
    }
    $policyMatch = Find-ByProperty -Items $reusablePolicies.result -Property 'id' -Value $AllowReusablePolicyId
    if ($policyMatch) {
        $reusablePolicyIds += $AllowReusablePolicyId
        Write-Info "admit reusable policy '$(Get-SafeProperty -Object (@($policyMatch)[0]) -Property 'name')' ($AllowReusablePolicyId)"
    }
    else {
        $groups = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/groups" -AllowFailure
        if (-not $groups.success) {
            Stop-WithGuidance -Problem "'$AllowReusablePolicyId' is not a reusable Access policy in account $AccountId, and Access groups could not be listed to check it further." -Guidance @"
$($groups.errorDetail)

The token needs 'Access: Organizations, Identity Providers, and Groups > Read'
to check whether the id names one instead.
"@
        }
        $groupMatch = Find-ByProperty -Items $groups.result -Property 'id' -Value $AllowReusablePolicyId
        if ($groupMatch) {
            Stop-WithGuidance -Problem "'$AllowReusablePolicyId' is an Access group ('$(Get-SafeProperty -Object (@($groupMatch)[0]) -Property 'name')'), not a reusable policy." -Guidance @'
Use -AllowGroupId instead of -AllowReusablePolicyId (or, in the policy file,
the "groupId" key instead of "reusablePolicyId").
'@
        }
        throw "No reusable Access policy or Access group with id '$AllowReusablePolicyId' exists in account $AccountId."
    }
}

# `policies` can carry both shapes at once: an inline rule built from
# emails/domain/group-by-name/group-by-id (only ever one such rule, "$ApplicationName - allow"),
# and, separately, a reference to each verified reusable policy — `{ id: ... }`
# with no inline decision/include, which is how a reusable policy is attached
# rather than duplicated inline (see -AllowReusablePolicyId above).
$policies = @()
if ($include.Count -gt 0) {
    $policies += @{
        name     = "$ApplicationName - allow"
        decision = 'allow'
        include  = $include
    }
}
foreach ($reusableId in $reusablePolicyIds) {
    $policies += @{ id = $reusableId }
}

# "worker" protects production and preview together; "preview_worker" protects
# preview deployments only — a genuinely different intent, offered via
# -PreviewOnly. Per
# https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker
$destinationType = if ($PreviewOnly) { 'preview_worker' } else { 'worker' }

$desired = @{
    type             = 'self_hosted'
    name             = $ApplicationName
    destinations     = @(@{ type = $destinationType; worker_id = $workerId })
    session_duration = $SessionDuration
    policies         = $policies
}

# ---------------------------------------------------------------------------
# 6. Create or update, idempotently
# ---------------------------------------------------------------------------

Write-Step 'Reconciling the Access application'

# Match on name first, then on the worker_id destination, so an app renamed
# in the dashboard is still found rather than duplicated.
function Test-DestinationTargetsWorker {
    <#
      True when any of an application's destinations names this Worker.

      Guarded rather than reading $_.worker_id directly: an account's other
      Access applications carry hostname destinations with no worker_id at all,
      and under Set-StrictMode -Version Latest reading a missing property
      throws instead of yielding $null. Seen for real against an account with
      41 existing applications.
    #>
    param(
        [Parameter(Mandatory)] [AllowNull()] $Destinations,
        [Parameter(Mandatory)] [string] $WorkerId
    )
    if (-not $Destinations) { return $false }
    foreach ($destination in @($Destinations)) {
        if ($null -eq $destination) { continue }
        if (-not ($destination -is [pscustomobject])) { continue }
        if ($destination.PSObject.Properties.Name -notcontains 'worker_id') { continue }
        if ($destination.worker_id -eq $WorkerId) { return $true }
    }
    return $false
}

$existing = Find-ByProperty -Items $apps.result -Property 'name' -Value $ApplicationName
if (-not $existing) {
    $existing = $apps.result | Where-Object {
        ($_ -is [pscustomobject]) -and
        ($_.PSObject.Properties.Name -contains 'destinations') -and
        (Test-DestinationTargetsWorker -Destinations $_.destinations -WorkerId $workerId)
    }
}
if (@($existing).Count -gt 1) {
    $ids = (@($existing) | ForEach-Object { Get-SafeProperty -Object $_ -Property 'id' }) -join ', '
    throw "Found more than one matching Access application ($ids). Remove the duplicates in the dashboard, then re-run."
}

if ($existing) {
    $appId = $existing.id
    Write-Info "Existing application found: $appId"

    # Always PUT rather than comparing first and skipping. An earlier version
    # compared only some fields, so re-running with a changed -AllowEmail /
    # -AllowEmailDomain / -AllowGroupName reported "nothing to change" and left
    # the old allow-list live — an operator trying to revoke someone's access
    # would have been told it worked. PUT sets the whole desired state, so it
    # is idempotent by construction and the policy can never drift from the
    # arguments given.
    if ($PSCmdlet.ShouldProcess("Access application $appId ($ApplicationName)", 'Update to match the given allow rule')) {
        $null = Invoke-CfApi -Method PUT -Path "/accounts/$AccountId/access/apps/$appId" -Body $desired
        Write-Ok 'Application reconciled to the desired state, including its allow policy'
        Write-Info 'The allow policy is replaced wholesale, so a removed -AllowEmail is genuinely revoked.'
    }
}
else {
    if ($PSCmdlet.ShouldProcess("Access application '$ApplicationName' for Worker $WorkerName", 'Create')) {
        $created = Invoke-CfApi -Method POST -Path "/accounts/$AccountId/access/apps" -Body $desired
        $appId = $created.result.id
        Write-Ok "Application created: $appId"
    }
    else {
        Write-Warn 'Skipped creation (-WhatIf).'
        return
    }
}

Write-Host ''
Write-Step 'Remaining, and not done by this script'
Write-Info '1. Set the stats token (a one-off, per admin Worker, not held by CI):'
Write-Info '   pnpm exec wrangler secret put CF_API_TOKEN -c wrangler.admin.jsonc'
Write-Info '   (needs Account Analytics read; without it /admin renders error notices)'
Write-Info "2. QA: the $WorkerName Worker's own hostname should now prompt for Access on every path,"
Write-Info "       while $script:RedirectWorkerName's hostname stays public and login-free."
Write-Info ''
Write-Info 'This script now runs on every deploy (.github/workflows/deploy-worker.yml), so it is no'
Write-Info 'longer a manual prerequisite. What remains manual, once, is: creating the two API tokens'
Write-Info '(CLOUDFLARE_API_TOKEN and CF_ACCESS_API_TOKEN — see this script''s .NOTES for the scopes'
Write-Info 'the latter needs) and having a Cloudflare Zero Trust organisation provisioned for the'
Write-Info 'account. Deploying the admin Worker itself is also no longer manual: CI deploys it before'
Write-Info 'this script runs, precisely so this Worker id resolves here.'
Write-Host ''
