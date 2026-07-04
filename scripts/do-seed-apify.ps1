# Lê as chaves Apify do transcript da conversa Claude e as insere no banco via API admin.
# Uso: .\scripts\do-seed-apify.ps1 -CronSecret "SEU_CRON_SECRET" [-ApiBase "https://saas-insta.vercel.app"]

param(
    [Parameter(Mandatory=$true)]  [string] $CronSecret,
    [Parameter(Mandatory=$false)] [string] $ApiBase = "https://saas-insta.vercel.app",
    [Parameter(Mandatory=$false)] [string] $TranscriptPath = "C:\Users\Administrator\.claude\projects\d--Saas\69a10120-18cf-455b-8e71-8c22fec80531.jsonl"
)

# Extrai chaves do transcript
$content = Get-Content $TranscriptPath -Raw
$allMatches = [regex]::Matches($content, 'apify_api_[a-zA-Z0-9]{35,}')
$tokenSet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($m in $allMatches) { [void]$tokenSet.Add($m.Value) }

# Remove tokens que são prefixo de outro (fragmentos parciais)
$tokens = [System.Collections.Generic.List[string]]::new()
foreach ($t in $tokenSet) {
    $isPrefix = $false
    foreach ($other in $tokenSet) {
        if ($other -ne $t -and $other.StartsWith($t)) { $isPrefix = $true; break }
    }
    if (-not $isPrefix) { $tokens.Add($t) }
}

Write-Host "Encontradas $($tokens.Count) chaves Apify"

if ($tokens.Count -eq 0) {
    Write-Error "Nenhuma chave encontrada no transcript."
    exit 1
}

# Chama a rota admin
$body = @{ tokens = $tokens.ToArray() } | ConvertTo-Json -Compress
$url  = "$ApiBase/api/admin/seed-system-apify-tokens"

$response = Invoke-RestMethod -Uri $url -Method POST `
    -Headers @{ "x-cron-secret" = $CronSecret; "Content-Type" = "application/json" } `
    -Body $body

Write-Host "Resultado: removidos=$($response.deleted) inseridos=$($response.inserted)"
