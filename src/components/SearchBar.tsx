import React, { useState, useEffect } from 'react';
import { useUi } from '../context/UiContext';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({ 
  onSearch, 
  placeholder,
  className = ""
}: SearchBarProps) {
  const { t } = useUi();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    onSearch(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  useEffect(() => {
    // Debounce search
    const handler = setTimeout(() => {
      if (query.trim()) {
        handleSearch();
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  return (
    <div className={`flex gap-2 ${className}`}>
      <input 
        type="text"
        placeholder={placeholder ?? t("common.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 p-2 bg-panel rounded border border-white/10 text-fg outline-none focus:ring-2 ring-accent"
      />
      <button 
        onClick={handleSearch}
        className="px-4 py-2 bg-accent hover:bg-white/20 rounded transition"
      >
        🔍 {t("common.search")}
      </button>
    </div>
  );
}