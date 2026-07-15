import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  CommandResult,
  MindMapCommand,
  MindMapDocument,
  MindMapId,
} from '@opentools/mindmap-core'
import { parseMindMapDocumentJson } from '@opentools/mindmap-format'
import { DexieMindMapRepository } from '@opentools/mindmap-storage'

import { useEditorUiStore } from '../editor/store'
import i18n from '../i18n'
import { toLocalizedError } from '../i18n/errors'
import type { LocalizedMessage } from '../i18n/messages'
import { readBrowserFileAsText } from '../platform/file-transfer'
import { EditorSession, type EditorSessionSnapshot } from '../editor/session'
import {
  MindMapLibraryService,
  toMindMapSummary,
  type MindMapSummary,
} from '../library/map-library'

export interface MindMapApplicationState {
  readonly error: LocalizedMessage | null
  readonly isBusy: boolean
  readonly maps: readonly MindMapSummary[]
  readonly phase: 'loading' | 'library' | 'editor'
  readonly session: EditorSessionSnapshot | null
}

function sortMapSummaries(
  summaries: readonly MindMapSummary[],
): MindMapSummary[] {
  return [...summaries].sort((left, right) => {
    const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
    return updatedOrder === 0 ? left.id.localeCompare(right.id) : updatedOrder
  })
}

function mergeMapSummary(
  summaries: readonly MindMapSummary[],
  document: MindMapDocument,
): MindMapSummary[] {
  return sortMapSummaries([
    toMindMapSummary(document),
    ...summaries.filter((summary) => summary.id !== document.id),
  ])
}

const initialState: MindMapApplicationState = {
  error: null,
  isBusy: false,
  maps: [],
  phase: 'loading',
  session: null,
}

/** Coordinates repository-backed library state with one active editor session. */
export function useMindMapApplication() {
  const repository = useMemo(() => new DexieMindMapRepository(), [])
  const library = useMemo(
    () =>
      new MindMapLibraryService(repository, {
        duplicateTitle: (title) => i18n.t('defaults.copyTitle', { title }),
        starterTitle: () => i18n.t('defaults.starterMap'),
        untitledTitle: () => i18n.t('defaults.untitledMap'),
      }),
    [repository],
  )
  const sessionRef = useRef<EditorSession | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<MindMapApplicationState>(initialState)

  const disposeSession = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    sessionRef.current?.dispose()
    sessionRef.current = null
  }, [])

  const startSession = useCallback(
    (document: MindMapDocument) => {
      disposeSession()
      const session = new EditorSession(document, repository)
      sessionRef.current = session
      useEditorUiStore.getState().resetEditorUi()
      useEditorUiStore.getState().setSelectedNodeIds([document.rootNodeId])
      useEditorUiStore
        .getState()
        .setSaveStatus(session.getSnapshot().saveStatus)
      unsubscribeRef.current = session.subscribe((snapshot) => {
        useEditorUiStore.getState().setSaveStatus(snapshot.saveStatus)
        setState((currentState) => ({
          ...currentState,
          error: null,
          maps: mergeMapSummary(currentState.maps, snapshot.document),
          phase: 'editor',
          session: snapshot,
        }))
      })
      setState((currentState) => ({
        ...currentState,
        error: null,
        maps: mergeMapSummary(currentState.maps, document),
        phase: 'editor',
        session: session.getSnapshot(),
      }))
    },
    [disposeSession, repository],
  )

  const hydrate = useCallback(async () => {
    setState((currentState) => ({
      ...currentState,
      error: null,
      isBusy: true,
      phase: 'loading',
    }))
    try {
      const maps = await library.hydrate()
      setState({
        error: null,
        isBusy: false,
        maps: maps.map(toMindMapSummary),
        phase: 'library',
        session: null,
      })
    } catch (error) {
      setState({
        ...initialState,
        error: toLocalizedError(error, 'errors.mapOperationFailed'),
        phase: 'library',
      })
    }
  }, [library])

  useEffect(() => {
    void hydrate()
    return () => {
      const session = sessionRef.current
      if (session) void session.flush().catch(() => undefined)
      disposeSession()
    }
  }, [disposeSession, hydrate])

  const createMap = useCallback(
    async (title: string) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        const document = await library.create(title)
        startSession(document)
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library, startSession],
  )

  const openMap = useCallback(
    async (id: MindMapId) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        const activeSession = sessionRef.current
        if (activeSession && activeSession.getSnapshot().document.id !== id) {
          await activeSession.flush()
        }
        const document = await library.open(id)
        startSession(document)
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library, startSession],
  )

  const renameMap = useCallback(
    async (id: MindMapId, title: string) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        const document = await library.rename(id, title)
        setState((currentState) => ({
          ...currentState,
          maps: mergeMapSummary(currentState.maps, document),
        }))
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library],
  )

  const duplicateMap = useCallback(
    async (id: MindMapId) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        const document = await library.duplicate(id)
        setState((currentState) => ({
          ...currentState,
          maps: mergeMapSummary(currentState.maps, document),
        }))
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library],
  )

  const deleteMap = useCallback(
    async (id: MindMapId) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        await library.delete(id)
        setState((currentState) => ({
          ...currentState,
          maps: currentState.maps.filter((summary) => summary.id !== id),
        }))
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library],
  )

  const returnToLibrary = useCallback(async () => {
    setState((currentState) => ({ ...currentState, isBusy: true, error: null }))
    try {
      await sessionRef.current?.flush()
      disposeSession()
      useEditorUiStore.getState().resetEditorUi()
      const maps = await library.list()
      setState({
        error: null,
        isBusy: false,
        maps: maps.map(toMindMapSummary),
        phase: 'library',
        session: null,
      })
    } catch (error) {
      setState((currentState) => ({
        ...currentState,
        error: toLocalizedError(error, 'errors.mapOperationFailed'),
      }))
    } finally {
      setState((currentState) => ({ ...currentState, isBusy: false }))
    }
  }, [disposeSession, library])

  const renameActiveMap = useCallback((title: string) => {
    try {
      sessionRef.current?.renameMap(title)
    } catch (error) {
      setState((currentState) => ({
        ...currentState,
        error: toLocalizedError(error, 'errors.mapOperationFailed'),
      }))
    }
  }, [])

  const executeActiveCommand = useCallback(
    (command: MindMapCommand): CommandResult | undefined => {
      try {
        return sessionRef.current?.execute(command)
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
        return undefined
      }
    },
    [],
  )

  const undoActiveCommand = useCallback((): CommandResult | undefined => {
    try {
      return sessionRef.current?.undo()
    } catch (error) {
      setState((currentState) => ({
        ...currentState,
        error: toLocalizedError(error, 'errors.mapOperationFailed'),
      }))
      return undefined
    }
  }, [])

  const redoActiveCommand = useCallback((): CommandResult | undefined => {
    try {
      return sessionRef.current?.redo()
    } catch (error) {
      setState((currentState) => ({
        ...currentState,
        error: toLocalizedError(error, 'errors.mapOperationFailed'),
      }))
      return undefined
    }
  }, [])

  const importMap = useCallback(
    async (file: File) => {
      setState((currentState) => ({
        ...currentState,
        error: null,
        isBusy: true,
      }))
      try {
        const parsed = parseMindMapDocumentJson(
          await readBrowserFileAsText(file),
        )
        await sessionRef.current?.flush()
        const imported = await library.import(parsed)
        startSession(imported)
      } catch (error) {
        setState((currentState) => ({
          ...currentState,
          error: toLocalizedError(error, 'errors.mapOperationFailed'),
        }))
      } finally {
        setState((currentState) => ({ ...currentState, isBusy: false }))
      }
    },
    [library, startSession],
  )

  return {
    ...state,
    createMap,
    deleteMap,
    duplicateMap,
    executeActiveCommand,
    hydrate,
    importMap,
    openMap,
    redoActiveCommand,
    renameActiveMap,
    renameMap,
    returnToLibrary,
    undoActiveCommand,
  }
}
