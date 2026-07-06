const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'soc-cockpit/src/components/LiveThreatFeed.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace the standard search state initialization
// From: const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
// To:
// const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
// const [localSearchQuery, setLocalSearchQuery] = useState(searchParams.get('search') || '');
// and add the useEffect for debounce
const searchState = `  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [localSearchQuery, setLocalSearchQuery] = useState(searchParams.get('search') || '');

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearchQuery]);`;

content = content.replace("const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');", searchState);

// Replace the onChange handler on the input
// From: value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
// To: value={localSearchQuery} onChange={(e) => setLocalSearchQuery(e.target.value)}
content = content.replace(
  "value={searchQuery}\n          onChange={(e) => setSearchQuery(e.target.value)}",
  "value={localSearchQuery}\n          onChange={(e) => setLocalSearchQuery(e.target.value)}"
);

fs.writeFileSync(filePath, content);
