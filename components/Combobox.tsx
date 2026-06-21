import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

interface Option {
  id: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string; // This is the display value (name)
  onChange: (id: string | null, name: string, isNew: boolean) => void; 
  placeholder?: string;
  label: string;
  disabled?: boolean;
}

export const Combobox: React.FC<Props> = ({ options, value, onChange, placeholder, label, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = query === ''
    ? options
    : options.filter((opt) =>
        opt.label.toLowerCase().includes(query.toLowerCase())
      );

  const handleSelect = (option: Option) => {
      onChange(option.id, option.label, false);
      setIsOpen(false);
      setQuery(option.label);
  };

  const handleCustom = () => {
      if (query.trim()) {
          onChange(null, query.trim(), true);
          setIsOpen(false);
      }
  };

  return (
    <div className="relative mb-3" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-white text-gray-900"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { 
              setQuery(e.target.value); 
              setIsOpen(true);
              // Clear selection if empty
              if (e.target.value === '') onChange(null, '', false);
          }}
          onFocus={() => !disabled && setIsOpen(true)}
        />
        <div className="absolute right-2 top-2.5 text-gray-400 pointer-events-none">
             <ChevronsUpDown size={16} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-auto animate-in fade-in zoom-in-95 duration-100">
          {filteredOptions.length === 0 && query !== '' ? (
            <div 
                className="cursor-pointer px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium flex items-center gap-2"
                onClick={handleCustom}
            >
              <Plus size={14} /> Create "{query}"
            </div>
          ) : (
             <>
               {query !== '' && !filteredOptions.some(o => o.label.toLowerCase() === query.toLowerCase()) && (
                   <div 
                        className="cursor-pointer px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium border-b border-gray-100 flex items-center gap-2 sticky top-0 bg-white"
                        onClick={handleCustom}
                    >
                    <Plus size={14} /> Create "{query}"
                    </div>
               )}
               {filteredOptions.map((option) => (
                <div
                  key={option.id}
                  className={`cursor-pointer px-4 py-2 text-sm hover:bg-gray-50 flex justify-between items-center transition-colors ${value === option.label ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                  onClick={() => handleSelect(option)}
                >
                  {option.label}
                  {value === option.label && <Check size={14} />}
                </div>
              ))}
              {filteredOptions.length === 0 && !query && (
                  <div className="px-4 py-2 text-xs text-gray-400 italic">Type to search...</div>
              )}
             </>
          )}
        </div>
      )}
    </div>
  );
};