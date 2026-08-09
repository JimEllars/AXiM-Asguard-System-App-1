const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    } catch (e) {
       if ((e as Error).name !== 'AbortError') {
          console.error("Manual sync failed", e);
       }
    } finally {
       if (syncAbortControllerRef.current === abortController) {
          setIsSyncing(false);
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
       }
    }
  }, []);`;

const replacement = `    } catch (e) {
       if ((e as Error).name !== 'AbortError') {
          console.error("Manual sync failed", e);
       }
    } finally {
       if (syncAbortControllerRef.current === abortController) {
          setIsSyncing(false);
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
       }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqView]);`;

code = code.replace(target, replacement);

fs.writeFileSync(file, code);
