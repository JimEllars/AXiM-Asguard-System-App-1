const fs = require('fs');
const file = 'soc-cockpit/src/pages/StreamPage.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('GlobalThreatMap')) {
    content = content.replace(/import React, \{ useState \} from 'react';/, "import React, { useState } from 'react';\nimport GlobalThreatMap from '../components/Stream/GlobalThreatMap';");

    // insert under analytics widgets
    const insertPt = content.indexOf('{/* VOD Grid */}');
    const mapStr = `
      {/* Global Threat Map */}
      <div className="w-full max-w-7xl mx-auto h-[400px] mt-6">
        <GlobalThreatMap />
      </div>

      `;
    content = content.substring(0, insertPt) + mapStr + content.substring(insertPt);
    fs.writeFileSync(file, content, 'utf8');
}
