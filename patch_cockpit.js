const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    fetchTelemetry();


    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);`;

const replace = `    fetchTelemetry();


    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqView]);`;

if (code.includes(target)) {
  code = code.replace(target, replace);
  console.log('patched handleManualSync deps');
} else {
  console.log('could not find handleManualSync target');
}

fs.writeFileSync(file, code);
