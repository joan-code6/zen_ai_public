import { Skeleton } from '@/components/ui/skeleton';

export function EmailListSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-9" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-4 rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = new Date().getDay();
  
  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      
      <div className="flex-1 p-4">
        <div className="grid grid-cols-7 gap-1 h-full">
          {days.map((day) => (
            <div key={day} className="text-center p-2">
              <Skeleton className="h-4 w-8 mx-auto mb-2" />
            </div>
          ))}
          {[...Array(35)].map((_, i) => {
            const isCurrentMonth = i >= 3 && i <= 33;
            const isToday = i === 17 + currentDay;
            const hasEvent1 = isCurrentMonth && [5, 8, 12, 15, 19, 22, 26, 29].includes(i);
            const hasEvent2 = isCurrentMonth && [7, 14, 21, 28].includes(i);
            return (
              <div 
                key={i} 
                className={`
                  min-h-[80px] p-1 border border-border/50 rounded-md
                  ${isCurrentMonth ? 'bg-card/30' : 'bg-muted/20'}
                  ${isToday ? 'ring-2 ring-primary ring-offset-2' : ''}
                `}
              >
                <Skeleton className="h-5 w-5 rounded-full mb-1 ml-1" />
                <div className="space-y-1 px-1">
                  {hasEvent1 && (
                    <Skeleton className="h-4 w-full rounded-sm" />
                  )}
                  {hasEvent2 && (
                    <Skeleton className="h-4 w-3/4 rounded-sm" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function NotesListSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className="bg-card/50 border border-border/50 rounded-xl p-5 backdrop-blur-sm"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="space-y-2 mb-4">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FilesGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <div 
          key={i}
          className="bg-card/50 border border-border/50 rounded-xl p-5 backdrop-blur-sm"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center justify-center mb-4 h-24">
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-3/4 mx-auto mb-2" />
          <Skeleton className="h-4 w-1/2 mx-auto mb-4" />
          <div className="space-y-2 mb-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-5 w-20 mx-auto rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function FilesListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div 
          key={i}
          className="bg-card/50 border border-border/50 rounded-lg p-4 backdrop-blur-sm"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FilesViewSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-card/50 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-full max-w-sm flex-1" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      
      <div className="border-b border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-8" />
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <FilesGridSkeleton />
      </div>
    </div>
  );
}

export function ChatMessagesSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      {[...Array(4)].map((_, i) => (
        <div 
          key={i} 
          className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className={`space-y-2 max-w-[70%] ${i % 2 === 0 ? '' : 'items-end'}`}>
            <Skeleton className="h-4 w-24" />
            <div className={`bg-card/50 border border-border/50 rounded-2xl p-4 space-y-2 backdrop-blur-sm ${i % 2 === 0 ? 'rounded-tl-sm' : 'rounded-tr-sm'}`}>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function McpSkeleton() {
  return (
    <div className="h-full flex">
      <div className="w-16 sm:w-24 md:w-40 lg:w-80 border-r border-border bg-card/50 flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div 
                key={i}
                className="bg-card/50 border border-border/50 rounded-lg p-3"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div 
              key={i}
              className="bg-card/50 border border-border/50 rounded-xl p-6"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DevicesSkeleton() {
  return (
    <div className="h-full flex">
      <div className="w-16 sm:w-24 md:w-40 lg:w-80 border-r border-border bg-card/50 flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i}
                className="bg-card/50 border border-border/50 rounded-lg p-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div 
              key={i}
              className="bg-card/50 border border-border/50 rounded-xl p-6"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-9 w-20" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="bg-muted/30 rounded-lg p-3">
                    <Skeleton className="h-3 w-16 mb-2" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
