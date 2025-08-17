$body = @{
    userId = "68a15b2019f7029868b8cb39"
    fullName = "Nghĩa Trọng"
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "Testing restore-name endpoint..."
try {
    $response = Invoke-RestMethod -Uri "https://cown.name.vn/api/restore-name" -Method POST -Body $body -Headers $headers
    Write-Host "Response:" $response
} catch {
    Write-Host "Error:" $_.Exception.Message
    Write-Host "Status:" $_.Exception.Response.StatusCode
}
