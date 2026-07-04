# Lê as chaves Apify do transcript e insere no banco via API admin (auth Supabase ou CRON_SECRET).
# Uso sem CRON_SECRET (usa cookie de sessão do browser):
#   .\scripts\do-seed-apify.ps1 -SessionCookie "sb-...-auth-token=..." [-ApiBase "https://saas-insta.vercel.app"]
# Uso com CRON_SECRET:
#   .\scripts\do-seed-apify.ps1 -CronSecret "SEU_CRON_SECRET"

param(
    [Parameter(Mandatory=$false)] [string] $CronSecret,
    [Parameter(Mandatory=$false)] [string] $SessionCookie,
    [Parameter(Mandatory=$false)] [string] $ApiBase = "https://saas-insta.vercel.app",
    [Parameter(Mandatory=$false)] [string] $TranscriptPath = "C:\Users\Administrator\.claude\projects\d--Saas\69a10120-18cf-455b-8e71-8c22fec80531.jsonl"
)

if (-not $CronSecret -and -not $SessionCookie) {
    Write-Error "Informe -CronSecret OU -SessionCookie"
    exit 1
}

# Extrai chaves do transcript
$content = Get-Content $TranscriptPath -Raw
$allMatches = [regex]::Matches($content, 'apify_api_[a-zA-Z0-9]{35,}')
$tokenSet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($m in $allMatches) { [void]$tokenSet.Add($m.Value) }

# Remove fragmentos (tokens que são prefixo de outro)
$tokens = [System.Collections.Generic.List[string]]::new()
foreach ($t in $tokenSet) {
    $isPrefix = $false
    foreach ($other in $tokenSet) {
        if ($other -ne $t -and $other.StartsWith($t)) { $isPrefix = $true; break }
    }
    if (-not $isPrefix) { $tokens.Add($t) }
}

Write-Host "Encontradas $($tokens.Count) chaves Apify no transcript"
if ($tokens.Count -eq 0) { Write-Error "Nenhuma chave encontrada."; exit 1 }

$body = @{ tokens = $tokens.ToArray() } | ConvertTo-Json -Compress
$url  = "$ApiBase/api/admin/seed-system-apify-tokens"

$headers = @{ "Content-Type" = "application/json" }
if ($CronSecret)    { $headers["x-cron-secret"] = $CronSecret }
if ($SessionCookie) { $headers["Cookie"] = $SessionCookie }

$response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body
Write-Host "Resultado: removidos=$($response.deleted) inseridos=$($response.inserted)"
