# Asks for the GitHub token (hidden while typing) and stores it as a Supabase function secret,
# so the sync server can start the daily job. The token is never printed or saved to a file.
$secure = Read-Host "Paste the GitHub token and press Enter" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $token) { Write-Host "No token entered."; exit 1 }
npx --yes supabase secrets set "GH_REPO=hArelZion/sleep-watch" "GH_TOKEN=$token" --project-ref fbvxwdunuyoptlwubqqj
Remove-Variable token
