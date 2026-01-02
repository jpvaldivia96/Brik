import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { forwardRef } from 'react';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, ...props }, ref) => {
    return (
      <div className={cn('search-input-wrapper', containerClassName)}>
        <Search className="search-icon w-5 h-5" />
        <input
          ref={ref}
          type="text"
          className={cn('input-cosmos w-full', className)}
          {...props}
        />
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
