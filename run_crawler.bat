@echo off
chcp 65001 >nul
echo ============================================================
echo   وقار للاستثمار العقاري — تشغيل زاحف الجمع التلقائي
echo   Waqar Real Estate Autonomous Crawler
echo ============================================================

REM Set your Apps Script Web App /exec URL below (or configure via environment variable)
IF "%WAQAR_WEBHOOK_URL%"=="" (
    SET "WAQAR_WEBHOOK_URL=PASTE_YOUR_WEB_APP_EXEC_URL_HERE"
)

node auto_crawler.js --url "%WAQAR_WEBHOOK_URL%"

echo.
echo اكتملت دورة البحث والمطابقة بنجاح.
pause
