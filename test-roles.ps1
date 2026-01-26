# Quick Role & Permissions Verification Script
# No database access required - uses API only

Write-Host "=== Testing Role Model and Permissions ===" -ForegroundColor Cyan
Write-Host ""

# Login
Write-Host "1. Logging in..." -ForegroundColor Yellow
$body = @{
  email = "admin@ayncor.local"
  password = "ayncor@123"
  org_slug = "ayncor"
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/login" -ContentType "application/json" -Body $body
    $access = $login.access_token
    Write-Host "   ✅ Login successful" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Decode JWT
Write-Host "`n2. Decoding JWT token..." -ForegroundColor Yellow
$parts = $access.Split('.')
if ($parts.Length -ne 3) {
    Write-Host "   ❌ Invalid JWT format" -ForegroundColor Red
    exit 1
}

$payload = $parts[1]
$mod = $payload.Length % 4
if ($mod -gt 0) { 
    $payload += "=" * (4 - $mod) 
}

try {
    $bytes = [System.Convert]::FromBase64String($payload)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    $claims = $json | ConvertFrom-Json
    Write-Host "   ✅ JWT decoded successfully" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to decode JWT: $_" -ForegroundColor Red
    exit 1
}

# Display claims
Write-Host "`n=== JWT Claims ===" -ForegroundColor Cyan
Write-Host "User ID (sub):        $($claims.sub)"
Write-Host "Org ID:               $($claims.org_id)"
Write-Host "Membership ID:        $($claims.membership_id)"
Write-Host "Role ID:              $($claims.role_id)"
Write-Host "JWT ID (jti):         $($claims.jti)"

# Verify permissions
Write-Host "`n=== Permissions ===" -ForegroundColor Cyan
if ($claims.perms -and $claims.perms.Count -gt 0) {
    Write-Host "✅ Permissions are included in JWT ($($claims.perms.Count) permissions)" -ForegroundColor Green
    Write-Host "`nPermissions list:" -ForegroundColor Yellow
    $claims.perms | ForEach-Object { Write-Host "  • $_" }
    
    # Check for expected permissions based on role
    if ($claims.perms -contains "org:manage_members") {
        Write-Host "`n✅ User has ORG_ADMIN permissions" -ForegroundColor Green
    } elseif ($claims.perms -contains "org:read") {
        Write-Host "`n✅ User has ORG_MEMBER permissions" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Permissions are missing!" -ForegroundColor Red
}

# Verify jti
Write-Host "`n=== JWT ID (jti) ===" -ForegroundColor Cyan
if ($claims.jti) {
    Write-Host "✅ JWT ID (jti) is included: $($claims.jti)" -ForegroundColor Green
} else {
    Write-Host "❌ JWT ID (jti) is missing!" -ForegroundColor Red
}

# Test refresh token
Write-Host "`n3. Testing refresh token..." -ForegroundColor Yellow
$refreshBody = @{ refresh_token = $login.refresh_token } | ConvertTo-Json
try {
    $newSession = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/refresh" -ContentType "application/json" -Body $refreshBody
    
    # Decode new token
    $newParts = $newSession.access_token.Split('.')
    $newPayload = $newParts[1]
    $newMod = $newPayload.Length % 4
    if ($newMod -gt 0) { $newPayload += "=" * (4 - $newMod) }
    $newBytes = [System.Convert]::FromBase64String($newPayload)
    $newJson = [System.Text.Encoding]::UTF8.GetString($newBytes)
    $newClaims = $newJson | ConvertFrom-Json
    
    Write-Host "   ✅ Refresh successful" -ForegroundColor Green
    Write-Host "   ✅ New JWT has perms: $($newClaims.perms -ne $null -and $newClaims.perms.Count -gt 0)" -ForegroundColor Green
    Write-Host "   ✅ New JWT has jti: $($newClaims.jti -ne $null)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Refresh failed: $_" -ForegroundColor Red
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$allGood = $true

if (-not ($claims.perms -and $claims.perms.Count -gt 0)) {
    Write-Host "❌ Permissions missing in JWT" -ForegroundColor Red
    $allGood = $false
}

if (-not $claims.jti) {
    Write-Host "❌ JWT ID (jti) missing" -ForegroundColor Red
    $allGood = $false
}

if (-not $claims.role_id) {
    Write-Host "❌ Role ID missing" -ForegroundColor Red
    $allGood = $false
}

if ($allGood) {
    Write-Host "✅ All checks passed! Role model and permissions are working correctly." -ForegroundColor Green
} else {
    Write-Host "⚠️  Some checks failed. Please review the output above." -ForegroundColor Yellow
}
