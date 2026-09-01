import { Plus, Search, Upload, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import ProductDialogs from './ProductDialogs'
import ProductFormModal from './ProductFormModal'
import ProductsTable from './ProductsTable'
import { useProducts } from './useProducts'

export default function ProductsPage() {
  const { isSachbearbeiter, isAdmin } = useAuth()
  const {
    search,
    setSearch,
    orgFilter,
    setOrgFilter,
    loading,
    showForm,
    editId,
    form,
    setForm,
    saving,
    error,
    showImport,
    importOrg,
    setImportOrg,
    importRows,
    importError,
    importing,
    importDone,
    confirmDelete,
    setConfirmDelete,
    deleting,
    customSizeInput,
    setCustomSizeInput,
    sizeGuideModal,
    setSizeGuideModal,
    fileRef,
    filtered,
    openNew,
    openEdit,
    save,
    toggleActive,
    confirmAndDelete,
    handleFile,
    runImport,
    toggleSize,
    addCustomSize,
    openImport,
    setShowForm,
    setShowImport,
  } = useProducts()

  return (
    <div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produkte</h1>
          <p className="text-gray-500 text-sm mt-1">Bekleidungskatalog</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isAdmin && filtered.length > 0 && (
            <button onClick={() => setConfirmDelete({ mode: 'all' })} className="flex items-center gap-2 border border-red-300 text-red-600 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-red-50 transition-colors" title="Löschen">
              <Trash2 className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{orgFilter === 'all' ? 'Alle löschen' : `${orgFilter} löschen`}</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={openImport} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50 transition-colors" title="Import">
              <Upload className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Import</span>
            </button>
          )}
          {isSachbearbeiter && (
            <button onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors" title="Neues Produkt">
              <Plus className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Neues Produkt</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['all', 'Stadtpolizei', 'Parkaufsicht'] as const).map(o => (
          <button key={o} onClick={() => setOrgFilter(o)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${orgFilter === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o === 'all' ? 'Alle' : o}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Name, Artikelnummer..."
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <ProductsTable
          products={filtered}
          isSachbearbeiter={isSachbearbeiter}
          onEdit={openEdit}
          onToggleActive={toggleActive}
          onDelete={p => setConfirmDelete({ mode: 'single', product: p })}
          onShowSizeGuide={setSizeGuideModal}
        />
      )}

      <ProductDialogs
        showImport={showImport}
        importOrg={importOrg}
        setImportOrg={setImportOrg}
        importRows={importRows}
        importError={importError}
        importing={importing}
        importDone={importDone}
        fileRef={fileRef}
        onFile={handleFile}
        onRunImport={runImport}
        onCloseImport={() => setShowImport(false)}
        sizeGuideModal={sizeGuideModal}
        onCloseSizeGuide={() => setSizeGuideModal(null)}
        confirmDelete={confirmDelete}
        deleting={deleting}
        filteredCount={filtered.length}
        orgFilter={orgFilter}
        onConfirmDelete={confirmAndDelete}
        onCancelDelete={() => setConfirmDelete(null)}
      />

      {showForm && (
        <ProductFormModal
          editId={editId}
          form={form}
          setForm={setForm}
          saving={saving}
          error={error}
          customSizeInput={customSizeInput}
          setCustomSizeInput={setCustomSizeInput}
          onToggleSize={toggleSize}
          onAddCustomSize={addCustomSize}
          onSave={save}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
