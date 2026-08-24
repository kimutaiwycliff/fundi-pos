/* Adapted from Payload's installation docs for the version actually pinned
   here (3.88.0) - @payloadcms/next/layouts in this version exports a plain
   `metadata` object, not the newer `generatePayloadViewport` helper. */
import type { ServerFunctionClient } from 'payload'

import config from '@payload-config'
import { handleServerFunctions, metadata, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'
// Payload's own base admin stylesheet - never actually imported (custom.css,
// imported below it, is an empty placeholder for theme overrides only).
// The admin panel has been rendering completely unstyled this whole time -
// nothing caught it because every check of /admin so far only confirmed an
// HTTP 200, never inspected the actual rendered/loaded CSS.
import '@payloadcms/next/css'
import './custom.css'

export { metadata }

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
