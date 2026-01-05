/**
 * Opens a print-ready window with a visitor badge
 * Can be printed on any printer - fits a standard ID badge size
 */

interface VisitorBadgeData {
    fullName: string;
    ci: string;
    company: string | null;
    visitReason?: string;
    photoUrl: string | null;
    siteName: string;
    date: Date;
}

export function printVisitorBadge(data: VisitorBadgeData) {
    const formattedDate = data.date.toLocaleDateString('es-BO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const formattedTime = data.date.toLocaleTimeString('es-BO', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Generate initials for fallback avatar
    const initials = data.fullName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const badgeHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Credencial Visitante - ${data.fullName}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    @page {
      size: 86mm 54mm; /* Standard ID card size */
      margin: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .badge {
      width: 86mm;
      height: 54mm;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
    }
    
    .badge-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .badge-header h1 {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .badge-type {
      background: rgba(255,255,255,0.3);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .badge-body {
      flex: 1;
      padding: 12px;
      display: flex;
      gap: 12px;
    }
    
    .badge-photo {
      width: 50px;
      height: 60px;
      border-radius: 6px;
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
      color: #64748b;
      overflow: hidden;
      flex-shrink: 0;
    }
    
    .badge-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .badge-info {
      flex: 1;
      min-width: 0;
    }
    
    .badge-name {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    
    .badge-company {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 6px;
    }
    
    .badge-detail {
      font-size: 9px;
      color: #94a3b8;
      margin-bottom: 2px;
    }
    
    .badge-footer {
      background: #f1f5f9;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #e2e8f0;
    }
    
    .badge-date {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
    }
    
    .badge-valid {
      font-size: 8px;
      color: #ef4444;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
        min-height: auto;
      }
      
      .badge {
        box-shadow: none;
        border: 1px solid #e2e8f0;
      }
    }
    
    .print-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      color: #667eea;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .print-btn:hover {
      background: #f8fafc;
    }
    
    @media print {
      .print-btn {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="badge">
    <div class="badge-header">
      <h1>${data.siteName}</h1>
      <span class="badge-type">Visitante</span>
    </div>
    
    <div class="badge-body">
      <div class="badge-photo">
        ${data.photoUrl
            ? `<img src="${data.photoUrl}" alt="Foto" crossorigin="anonymous">`
            : initials
        }
      </div>
      
      <div class="badge-info">
        <div class="badge-name">${data.fullName}</div>
        <div class="badge-company">${data.company || 'Visitante'}</div>
        <div class="badge-detail">CI: ${data.ci}</div>
        ${data.visitReason ? `<div class="badge-detail">${data.visitReason}</div>` : ''}
      </div>
    </div>
    
    <div class="badge-footer">
      <div class="badge-date">${formattedDate} • ${formattedTime}</div>
      <div class="badge-valid">Válido solo hoy</div>
    </div>
  </div>
  
  <button class="print-btn" onclick="window.print()">
    🖨️ Imprimir Credencial
  </button>
</body>
</html>
  `;

    // Open new window with badge
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(badgeHTML);
        printWindow.document.close();
    }
}
