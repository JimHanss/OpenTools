import { useTranslation } from 'react-i18next'

import { EditorShell } from './components/editor-shell'
import { MapLibraryView } from './components/map-library-view'
import { useMindMapApplication } from './app/use-mind-map-application'
import { translateMessage } from './i18n/messages'

export default function App() {
  const { t } = useTranslation()
  const application = useMindMapApplication()
  const error = application.error
    ? translateMessage(t, application.error)
    : null

  if (application.phase === 'loading') {
    return (
      <main className="app-loading" aria-live="polite">
        {t('app.loading')}
      </main>
    )
  }

  if (application.phase === 'editor' && application.session) {
    return (
      <EditorShell
        error={error}
        isBusy={application.isBusy}
        onExecute={application.executeActiveCommand}
        onImport={application.importMap}
        onRename={application.renameActiveMap}
        onRedo={application.redoActiveCommand}
        onReturnToLibrary={application.returnToLibrary}
        onUndo={application.undoActiveCommand}
        session={application.session}
      />
    )
  }

  return (
    <MapLibraryView
      error={error}
      isBusy={application.isBusy}
      maps={application.maps}
      onCreate={application.createMap}
      onDelete={application.deleteMap}
      onDuplicate={application.duplicateMap}
      onOpen={application.openMap}
      onRename={application.renameMap}
    />
  )
}
