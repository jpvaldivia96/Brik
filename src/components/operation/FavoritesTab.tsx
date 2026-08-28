import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, StarOff, ShieldAlert, ShieldOff, Search, AlertTriangle, X, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FavoriteStatus } from '@/lib/types';

type TabMode = 'favorites' | 'blocked';

export default function FavoritesTab() {
  const { currentSite } = useSite();
  const { user } = useAuth();
  const [mode, setMode] = useState<TabMode>('favorites');
  const [items, setItems] = useState<FavoriteStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Block modal state
  const [blockModal, setBlockModal] = useState<{ open: boolean; person: any | null }>({ open: false, person: null });
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  // Trust report state
  const [reportToTrust, setReportToTrust] = useState(false);
  const [trustSeverity, setTrustSeverity] = useState<'leve' | 'moderado' | 'grave'>('moderado');
  const [trustCategory, setTrustCategory] = useState('');

  const fetchItems = async () => {
    if (!currentSite || !user) return;
    setLoading(true);

    // Favorites are per-user, blocked are site-wide
    // Query: user's favorites OR any blocked persons
    const { data: favs } = await (supabase as any)
      .from('favorites')
      .select('*, people(*)')
      .eq('site_id', currentSite.id)
      .or(`user_id.eq.${user.id},is_blocked.eq.true`);

    const peopleIds = (favs || []).map(f => (f.people as any)?.id).filter(Boolean);

    const { data: logs } = await supabase
      .from('access_logs')
      .select('person_id, entry_at')
      .eq('site_id', currentSite.id)
      .is('exit_at', null)
      .is('voided_at', null)
      .in('person_id', peopleIds);

    const insideMap = new Map((logs || []).map(l => [l.person_id, l.entry_at]));

    const result: FavoriteStatus[] = (favs || []).map(f => {
      const p = f.people as any;
      const entryAt = insideMap.get(p.id);
      const hours = entryAt ? (Date.now() - new Date(entryAt).getTime()) / 3600000 : null;
      return {
        id: f.id,
        person_id: p.id,
        full_name: p.full_name,
        ci: p.ci,
        contractor: p.contractor,
        type: p.type,
        is_inside: !!entryAt,
        entry_at: entryAt || null,
        hours,
        status: hours ? (hours >= 12 ? 'crit' : hours >= 10 ? 'warn' : 'ok') : null,
        is_blocked: f.is_blocked || false,
        block_reason: f.block_reason || null,
      };
    });

    setItems(result);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [currentSite, user]);

  // Auto-search as user types with debounce
  useEffect(() => {
    if (!query.trim() || !currentSite) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentSite]);

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);

    const { data } = await supabase
      .from('people')
      .select('*')
      .eq('site_id', currentSite.id)
      .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
      .limit(10);

    setSearchResults(data || []);
    setSearching(false);
  };

  const toggleFavorite = async (personId: string, isFav: boolean) => {
    if (!currentSite || !user) return;

    if (isFav) {
      const { error } = await (supabase as any).from('favorites').delete().eq('site_id', currentSite.id).eq('person_id', personId).eq('user_id', user.id);
      if (error) console.error('Error removing favorite:', error);
    } else {
      const { error } = await (supabase as any).from('favorites').insert({ site_id: currentSite.id, person_id: personId, is_blocked: false, user_id: user.id });
      if (error) console.error('Error adding favorite:', error);
    }
    fetchItems();
    setSearchResults([]);
    setQuery('');
  };

  const openBlockModal = (person: any) => {
    setBlockModal({ open: true, person });
    setBlockReason('');
  };

  const confirmBlock = async () => {
    if (!currentSite || !blockModal.person) return;
    setBlocking(true);

    const personId = blockModal.person.id || blockModal.person.person_id;

    // Check if already in favorites
    const existing = items.find(i => i.person_id === personId);

    if (existing) {
      // Update existing
      await supabase
        .from('favorites')
        .update({ is_blocked: true, block_reason: blockReason.trim() || null, blocked_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Insert new as blocked
      await (supabase as any)
        .from('favorites')
        .insert({
          site_id: currentSite.id,
          person_id: personId,
          is_blocked: true,
          block_reason: blockReason.trim() || null,
          blocked_at: new Date().toISOString(),
          user_id: null  // Blocked persons are site-wide, no user_id
        });
    }

    setBlocking(false);
    setBlockModal({ open: false, person: null });

    // Automatically report to trust database (Red de Seguridad)
    if (blockReason.trim()) {
      const person = blockModal.person;
      await (supabase as any)
        .from('trust_reports')
        .insert({
          ci: person.ci || person.people?.ci,
          person_name: person.full_name || person.people?.full_name,
          photo_url: person.photo_url || person.people?.photo_url || null,
          contractor_name: person.contractor || person.people?.contractor || null,
          category: trustCategory || null,
          severity: trustSeverity,
          reason: blockReason.trim(),
          reported_by_site_id: currentSite.id,
          reported_by_user_id: user?.id,
          reported_by_site_name: currentSite.name,
        });
    }
    setTrustCategory('');

    fetchItems();
    setSearchResults([]);
    setQuery('');
  };

  const unblock = async (item: FavoriteStatus) => {
    await supabase
      .from('favorites')
      .update({ is_blocked: false, block_reason: null, blocked_at: null })
      .eq('id', item.id);
    fetchItems();
  };

  const removeFromList = async (item: FavoriteStatus) => {
    await supabase.from('favorites').delete().eq('id', item.id);
    fetchItems();
  };

  const filteredItems = items.filter(i => mode === 'blocked' ? i.is_blocked : !i.is_blocked);

  return (
    <div className="operation-panel space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-card/50 rounded-xl">
        <button
          onClick={() => setMode('favorites')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
            mode === 'favorites'
              ? "bg-primary text-primary-foreground shadow-lg"
              : "text-muted-foreground hover:text-foreground hover:bg-card/80"
          )}
        >
          <Star className="w-4 h-4" />
          Favoritos
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
            {items.filter(i => !i.is_blocked).length}
          </span>
        </button>
        <button
          onClick={() => setMode('blocked')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
            mode === 'blocked'
              ? "bg-red-500 text-white shadow-lg"
              : "text-muted-foreground hover:text-foreground hover:bg-card/80"
          )}
        >
          <ShieldAlert className="w-4 h-4" />
          Bloqueados
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
            {items.filter(i => i.is_blocked).length}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <SearchInput
          placeholder={mode === 'favorites' ? "Agregar favorito..." : "Agregar a lista de bloqueo..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          containerClassName="flex-1"
        />
        <Button onClick={handleSearch} disabled={searching}>
          {searching ? <Spinner size="sm" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2 border border-border/50 rounded-xl p-3 bg-card/30">
          <p className="text-xs text-muted-foreground mb-2">Resultados de búsqueda</p>
          {searchResults.map((p) => {
            const isFav = items.some(f => f.person_id === p.id && !f.is_blocked);
            const isBlocked = items.some(f => f.person_id === p.id && f.is_blocked);
            return (
              <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">CI: {p.ci}</p>
                </div>
                <div className="flex gap-2">
                  {mode === 'favorites' ? (
                    <Button
                      variant={isFav ? 'secondary' : 'default'}
                      size="sm"
                      onClick={() => toggleFavorite(p.id, isFav)}
                    >
                      {isFav ? <StarOff className="w-4 h-4 mr-1" /> : <Star className="w-4 h-4 mr-1" />}
                      {isFav ? 'Quitar' : 'Agregar'}
                    </Button>
                  ) : (
                    <Button
                      variant={isBlocked ? 'secondary' : 'destructive'}
                      size="sm"
                      onClick={() => isBlocked ? null : openBlockModal(p)}
                      disabled={isBlocked}
                    >
                      {isBlocked ? <ShieldOff className="w-4 h-4 mr-1" /> : <ShieldAlert className="w-4 h-4 mr-1" />}
                      {isBlocked ? 'Ya bloqueado' : 'Bloquear'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          {mode === 'favorites' ? (
            <>
              <Star className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No hay favoritos en esta obra.</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Busca trabajadores para agregarlos aquí.</p>
            </>
          ) : (
            <>
              <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No hay personas bloqueadas.</p>
              <p className="text-sm text-muted-foreground/70 mt-1">La lista de bloqueo está vacía.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-4 rounded-xl border transition-colors",
                item.is_blocked
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-card/50 border-border/50"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{item.full_name}</p>
                  {item.is_inside && <StatusBadge status={item.status || 'ok'} />}
                </div>
                <p className="text-sm text-muted-foreground">CI: {item.ci}</p>
                {item.is_blocked && item.block_reason && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    {item.block_reason}
                  </div>
                )}
                {!item.is_blocked && item.is_inside && item.hours !== null && (
                  <p className="text-xs text-muted-foreground mt-1">{item.hours.toFixed(1)}h en sitio</p>
                )}
              </div>
              <div className="flex gap-2">
                {item.is_blocked ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => unblock(item)}>
                      <ShieldOff className="w-4 h-4 mr-1" />
                      Desbloquear
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeFromList(item)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openBlockModal(item)}>
                      <ShieldAlert className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeFromList(item)}>
                      <StarOff className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block Modal */}
      <Dialog open={blockModal.open} onOpenChange={(o) => !o && setBlockModal({ open: false, person: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-5 h-5" />
              Bloquear Persona
            </DialogTitle>
          </DialogHeader>

          {blockModal.person && (
            <div className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="font-medium">{blockModal.person.full_name}</p>
                <p className="text-sm text-muted-foreground">CI: {blockModal.person.ci}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo del bloqueo (opcional)</label>
                <Input
                  placeholder="Ej: Robo, comportamiento inadecuado..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Esta persona aparecerá con una alerta cuando intente ingresar. El guardia decidirá si permite la entrada.
              </p>

              {/* Red de Seguridad — Automatic report */}
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">Red de Seguridad</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Al bloquear, se reportará automáticamente a todas las obras de la plataforma.
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {(['leve', 'moderado', 'grave'] as const).map(sev => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setTrustSeverity(sev)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                        trustSeverity === sev
                          ? sev === 'grave' ? 'bg-red-500/20 border-red-500/40 text-red-400'
                            : sev === 'moderado' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                            : 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
                          : 'border-border bg-card/30 text-muted-foreground'
                      }`}
                    >
                      {sev === 'grave' ? '🔴 Grave' : sev === 'moderado' ? '🟠 Moderado' : '🟡 Leve'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setBlockModal({ open: false, person: null })}>
                  Cancelar
                </Button>
                <Button variant="destructive" className="flex-1" onClick={confirmBlock} disabled={blocking}>
                  {blocking ? <Spinner size="sm" className="mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
                  Bloquear
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
