import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const snapshot = (name: string) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../public/data/${name}`, import.meta.url)), 'utf8',
))
const tabs = ['dashboard', 'map', 'analytics', 'wind', 'sources', 'population', 'shield', 'settings']
const dataFiles = ['sources.json', 'corridor.geojson', 'ranked_sites.json', 'actions.json', 'aqi.json', 'wind.json']

// Basemap assets and optional web fonts are mocked for offline journeys.
// Atmospheric data is always served by the application's normal snapshot path.
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII=', 'base64')
async function localBasemap(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '/* Offline test uses the application system-font fallback. */' }))
  await page.route('https://server.arcgisonline.com/**', route => route.fulfill({ contentType: 'image/png', body: transparentTile }))
  // An empty, valid protobuf font response removes the external font dependency.
  // Map worker data, scientific layers, and all DOM legend labels stay real.
  await page.route('https://demotiles.maplibre.org/font/**', route => route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }))
  await page.route('https://basemaps.cartocdn.com/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'test-background', type: 'background', paint: { 'background-color': '#edf1ec' } }] }),
  }))
}

function runtimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  return errors
}

async function visitTab(page: Page, tab: string) {
  await page.locator(`#nav-${tab}`).click()
  await expect(page.locator(`#nav-${tab}`)).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.header-view-title')).toBeVisible()
  await expect(page.locator('.view-skeleton-container')).toHaveCount(0)
}

async function assertNoPageOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(width.document, 'The page must not require horizontal scrolling; wide tables may scroll inside their panel.').toBeLessThanOrEqual(width.viewport + 1)
}

async function palettePixelCount(page: Page, png: Buffer) {
  return page.evaluate(base64 => new Promise<number>((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('Unable to read the actual map screenshot'))
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const colors = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]]
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (colors.some(color => color.every((value, channel) => Math.abs(pixels[i + channel] - value) <= 2))) count++
      }
      resolve(count)
    }
    image.src = `data:image/png;base64,${base64}`
  }), png.toString('base64'))
}

async function scientificCanvasScreenshot(page: Page) {
  // A locator screenshot captures everything above its rectangle, including
  // DOM markers. Hide those overlays only while measuring the rendered canvas:
  // on mobile they can cover every occupied cell or supply false palette pixels.
  return page.locator('.maplibregl-canvas').screenshot({ style: '.maplibregl-marker { visibility: hidden !important; }' })
}

async function heatmapColoredPixels(page: Page) {
  return palettePixelCount(page, await scientificCanvasScreenshot(page))
}

test.beforeEach(async ({ page }) => { await localBasemap(page) })
test.beforeAll(async ({ browser }) => { console.info(`Installed browser version: ${browser.version()}`) })

test('archived provenance is visible and exposes exact hashes without relabelling observations', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByRole('complementary', { name: 'Model provenance and scientific limitations' })
  await expect(notice).toContainText('Archived ten-source detector output')
  await expect(notice).toContainText('obsolete concentration and risk floors')
  await notice.getByText('Inspect source and corridor provenance', { exact: true }).click()
  await expect(notice).toContainText('900b5925955635660d90295b2324083fc52a23a3596aaab9450f518a7221135a')
  await expect(notice).toContainText('32f81bc4e31b03fdc2ea9282bc447da410b80c2d1a6a245d7767b60b10fbd603')
  await expect(notice).toContainText('NOT_RECORDED')
})

test('changed snapshot bytes are disclosed as unknown lineage', async ({ page }) => {
  const data = snapshot('sources.json')
  await page.route('**/data/sources.json', route => route.fulfill({ json: data }))
  await page.goto('/')
  const notice = page.getByRole('complementary', { name: 'Model provenance and scientific limitations' })
  await expect(notice).not.toContainText('Archived ten-source detector output')
  await notice.getByText('Inspect source and corridor provenance', { exact: true }).click()
  await expect(notice).toContainText('UNVERSIONED_UNKNOWN')
})

test('all eight views load real snapshots, fit the viewport, and satisfy automated WCAG checks', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page)
  await page.goto('/')
  await expect(page.locator('#nav-dashboard')).toBeVisible()
  await expect(page.locator('.skeleton-mode')).toHaveCount(0)
  const violations: unknown[] = []
  for (const tab of tabs) {
    await visitTab(page, tab)
    if (tab === 'dashboard') await expect(page.locator('.map-science-note')).toContainText('up to 8 ranked sites')
    if (tab === 'map') await expect(page.locator('.map-science-note')).toContainText('up to 12 ranked sites')
    await assertNoPageOverflow(page)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach(`${tab}-accessibility.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath(`${tab}.png`) })
    violations.push(...result.violations.map(v => ({ tab, id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })))
  }
  expect(errors).toEqual([])
  expect(violations, 'Accessibility across all eight views').toEqual([])
})

test('tablet views do not overflow after navigation and sidebar expansion', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/')
  await expect(page.locator('#nav-dashboard')).toBeVisible()
  for (const tab of tabs) {
    await visitTab(page, tab)
    await assertNoPageOverflow(page)
  }
  await page.locator('.sidebar-expand-action-btn').click()
  await assertNoPageOverflow(page)
})

test('a failed feed is unavailable, valid feeds remain visible, and retry recovers it', async ({ page }) => {
  let failed = true
  await page.route('**/data/aqi.json', route => failed
    ? route.fulfill({ status: 503, body: 'Unavailable' })
    : route.continue())
  await page.goto('/')
  await expect(page.locator('.feed-error-banner')).toContainText('aqi')
  await expect(page.locator('.agent-card')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }).check()
  await expect(page.locator('.heatmap-controls')).toContainText('No valid geolocated PM2.5 observations available.')
  failed = false
  await page.getByRole('button', { name: /retry/i }).click()
  await expect(page.locator('.feed-error-banner')).toHaveCount(0)
  await expect(page.locator('.agent-card')).toBeVisible()
  await expect(page.locator('.heatmap-controls')).toContainText('OpenAQ')
})

test('total feed failure shows an error without sample data and recovers on retry', async ({ page }) => {
  let failed = true
  for (const file of dataFiles) await page.route(`**/data/${file}`, route => failed
    ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await page.goto('/')
  await expect(page.getByText('Data Unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('.agent-card')).toHaveCount(0)
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: /retry/i }).click()
  await expect(page.locator('.agent-card')).toBeVisible()
})

test('malformed JSON and invalid source coordinates never become populated source markers', async ({ page }) => {
  const sources = snapshot('sources.json')
  sources.sources[0].lat = 100
  await page.route('**/data/sources.json', route => route.fulfill({ json: sources }))
  await page.goto('/')
  await expect(page.locator('.feed-error-banner')).toContainText('sources')
  await expect(page.locator('.aeris-sensor-reticle')).toHaveCount(0)
  await page.route('**/data/sources.json', route => route.fulfill({ contentType: 'application/json', body: '{broken JSON' }))
  await page.getByRole('button', { name: /retry/i }).click()
  await expect(page.locator('.feed-error-banner')).toContainText('sources')
  await expect(page.locator('.aeris-sensor-reticle')).toHaveCount(0)
})

test('refresh rejects changed invalid data even when generated_at matches and labels retained data', async ({ page }) => {
  await page.goto('/')
  const markers = page.locator('.aeris-sensor-reticle')
  await expect(markers).not.toHaveCount(0)
  const initialCount = await markers.count()
  const data = snapshot('sources.json')
  data.sources[0].lat = 100
  await page.route('**/data/sources.json', route => route.fulfill({ json: data }))
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click()
  await expect(page.locator('.feed-error-banner')).toContainText('sources')
  await expect(page.locator('.feed-error-banner')).toContainText(/retained/i)
  await expect(markers).toHaveCount(initialCount)
})

test('empty feeds render all views without invented observations or uncaught errors', async ({ page }) => {
  const errors = runtimeErrors(page)
  for (const file of dataFiles) {
    const data = snapshot(file)
    for (const key of ['sources', 'features', 'sites', 'actions', 'authority_actions', 'stations', 'points']) {
      if (key in data) data[key] = []
    }
    if ('exposed_population' in data) data.exposed_population = { estimate: 0, low: 0, high: 0, data_available: false }
    await page.route(`**/data/${file}`, route => route.fulfill({ json: data }))
  }
  await page.goto('/')
  for (const tab of tabs) {
    await visitTab(page, tab)
    await expect(page.locator('.main-content')).not.toContainText('NaN')
  }
  await visitTab(page, 'map')
  await page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }).check()
  await expect(page.getByText('No valid geolocated PM2.5 observations available.', { exact: false })).toBeVisible()
  await expect(page.locator('.main-content')).not.toContainText('676 MW')
  expect(errors).toEqual([])
})

test('heatmap exposes observed units, historical timestamps, opacity, and keyboard toggle', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page)
  await page.goto('/')
  const toggle = page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' })
  await expect(toggle).toBeVisible()
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toBeChecked()
  await expect(page.getByText('Observed station PM2.5 · station mean (µg/m³)', { exact: true })).toBeVisible()
  await expect(page.locator('.heatmap-controls')).toContainText('µg/m³')
  await expect(page.locator('.heatmap-controls')).toContainText(/stale|historical/i)
  await expect(page.locator('.heatmap-controls')).toContainText(/OpenAQ/)
  await expect(page.locator('.heatmap-controls')).toContainText(/interpolat/i)
  await assertNoPageOverflow(page)
  expect((await page.locator('.maplibregl-canvas').boundingBox())?.height, 'Expanded controls must leave a usable visible map canvas.').toBeGreaterThanOrEqual(250)
  const opacity = page.getByRole('slider', { name: 'Heatmap opacity' })
  await opacity.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(opacity).toBeFocused()
  const legend = page.getByRole('region', { name: 'PM2.5 station mean legend, micrograms per cubic metre' })
  await legend.focus()
  await page.keyboard.press('ArrowRight')
  await expect(legend).toBeFocused()
  await page.getByRole('button', { name: 'Fit observed cells', exact: true }).click()
  await page.locator('.heatmap-controls').getByText(/Accessible cell values/).click()
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await testInfo.attach('heatmap-accessibility.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
  await toggle.uncheck()
  await expect(toggle).not.toBeChecked()
  await visitTab(page, 'map')
  await expect(page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a zero-valued observed PM2.5 reading remains available with its time and source', async ({ page }) => {
  // Boundary-case values are confined to this browser test's intercepted response.
  // No captured or production snapshot is changed.
  const now = Date.parse('2026-10-09T08:00:00Z')
  await page.addInitScript(value => {
    const started = performance.now()
    Date.now = () => value + performance.now() - started
  }, now)
  const data = snapshot('aqi.json')
  data.generated_at = '2026-10-09T08:00:00Z'
  data.stations = [{ ...data.stations[0], pm25: 0, aqi: 0, observed_at: '2026-10-09T08:00:00Z' }]
  await page.route('**/data/aqi.json', route => route.fulfill({ json: data }))
  await page.goto('/')
  await page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }).check()
  const controls = page.locator('.heatmap-controls')
  await expect(controls).toContainText('1 station readings')
  await expect(controls).toContainText('0 stale')
  await expect(controls).toContainText('2026-10-09T08:00:00.000Z')
  await expect(controls).toContainText('OpenAQ')
  await page.getByRole('button', { name: 'Fit observed cells', exact: true }).click()
  await controls.getByText(/Accessible cell values/).click()
  await expect(controls.getByRole('cell', { name: '0.0', exact: true })).toBeVisible()
})

test('API text in a real map popup stays text rather than executable HTML', async ({ page }) => {
  const data = snapshot('sources.json')
  const payload = '<img src="invalid-test-image" onerror="window.aerisInjected = true">'
  data.sources[0].district = payload
  data.sources[0].location_name = payload
  await page.route('**/data/sources.json', route => route.fulfill({ json: data }))
  await page.goto('/')
  const marker = page.locator('.aeris-sensor-reticle').first()
  await expect(marker).toBeVisible()
  await marker.dispatchEvent('click')
  await expect(page.locator('.sensor-district-title')).toHaveText(payload)
  await expect(page.locator('.aeris-popup img')).toHaveCount(0)
  expect(await page.evaluate(() => (window as typeof window & { aerisInjected?: boolean }).aerisInjected)).toBeUndefined()
})

test('action dialog traps keyboard focus, closes on Escape, and restores its trigger', async ({ page }, testInfo) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'View All Recommendations' })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  const buttons = dialog.getByRole('button')
  await buttons.last().focus()
  await page.keyboard.press('Tab')
  await expect(buttons.first()).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(buttons.last()).toBeFocused()
  // Contrast is assessed after the opening fade, not during translucent frames.
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await expect.poll(() => page.locator('.modal-backdrop').evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await testInfo.attach('dialog-accessibility.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('real MapLibre WebGL paints observations, restores scientific layers after style changes, and removes disabled heatmap', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page)
  // Observe the actual worker data flow without exposing an application debug
  // API or substituting a fake map implementation.
  await page.addInitScript(() => {
    const transfers: { source: string; featureCount: number }[] = []
    const removed: string[] = []
    const state = window as typeof window & { aerisWorkerTransfers: typeof transfers; aerisRemovedSources: string[]; aerisSourceState: Record<string, Record<number, number>> }
    state.aerisWorkerTransfers = transfers
    state.aerisRemovedSources = removed
    state.aerisSourceState = {}
    const workerIds = new WeakMap<Worker, number>()
    let nextWorkerId = 0
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, options) {
      if (!workerIds.has(this)) workerIds.set(this, ++nextWorkerId)
      const workerId = workerIds.get(this)!
      if (message?.type === 'LD' && ['corridor', 'observed-pm25'].includes(message.data?.source)) {
        const data = typeof message.data.data === 'string' ? JSON.parse(message.data.data) : message.data.data
        if (Array.isArray(data?.features)) {
          transfers.push({ source: message.data.source, featureCount: data.features.length })
          ;(state.aerisSourceState[message.data.source] ??= {})[workerId] = data.features.length
        }
      }
      if (message?.type === 'RS' && ['corridor', 'observed-pm25'].includes(message.data?.source)) {
        ;(state.aerisSourceState[message.data.source] ??= {})[workerId] = 0
        if (message.data.source === 'observed-pm25') removed.push(message.data.source)
      }
      return original.call(this, message, Array.isArray(options) ? { transfer: options } : options)
    }
  })
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const restored = (source = 'corridor') => page.evaluate(id => (window as typeof window & {
    aerisWorkerTransfers: { source: string; featureCount: number }[]
  }).aerisWorkerTransfers.filter(t => t.source === id && t.featureCount > 0).length, source)
  await expect.poll(restored, { message: 'The real corridor must reach the WebGL worker.' }).toBeGreaterThan(0)
  await page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }).check()
  await expect.poll(() => restored('observed-pm25')).toBeGreaterThan(0)
  const opacity = page.getByRole('slider', { name: 'Heatmap opacity' })
  await opacity.focus()
  await page.keyboard.press('End')
  await expect(opacity).toHaveValue('1')
  await page.getByRole('button', { name: 'Fit observed cells', exact: true }).click()
  await expect.poll(() => heatmapColoredPixels(page), { message: 'The actual WebGL canvas must paint the station-cell intensity colors.' }).toBeGreaterThan(10)
  await page.screenshot({ path: testInfo.outputPath('enabled-observed-heatmap.png') })
  await page.locator('.maplibregl-canvas').screenshot({ path: testInfo.outputPath('enabled-observed-heatmap-canvas.png') })
  for (const name of ['Dark GIS', 'Topographic', 'Satellite']) {
    await page.getByRole('button', { name: 'Switch Basemap Style' }).click()
    const loaded = page.waitForResponse(response => name === 'Satellite'
      ? response.url().startsWith('https://server.arcgisonline.com/')
      : response.url().includes(name === 'Dark GIS' ? '/dark-matter-gl-style/style.json' : '/voyager-gl-style/style.json'))
    await page.locator('.map-layer-dropdown').getByRole('button', { name: new RegExp(name) }).click()
    await (await loaded).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    // MapLibre may reuse an unchanged source while diffing styles. Both reuse
    // and recreation must preserve populated worker state and painted cells.
    for (const source of ['corridor', 'observed-pm25']) {
      // A source recreated on another worker must not be cleared by the old
      // worker's asynchronous removal. Track each real worker independently.
      await expect.poll(() => page.evaluate(id => Object.values((window as typeof window & { aerisSourceState: Record<string, Record<number, number>> }).aerisSourceState[id] ?? {}).some(count => count > 0), source), {
        message: `${source} must remain populated after ${name}.`,
      }).toBe(true)
    }
    await expect.poll(() => heatmapColoredPixels(page), { message: `The observation layer must remain painted after ${name}.` }).toBeGreaterThan(10)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await expect(page.locator('.svg-map')).toHaveCount(0)
  }
  const removedBefore = await page.evaluate(() => (window as typeof window & { aerisRemovedSources: string[] }).aerisRemovedSources.length)
  await page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }).uncheck()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { aerisRemovedSources: string[] }).aerisRemovedSources.length)).toBeGreaterThan(removedBefore)
  await expect.poll(() => heatmapColoredPixels(page), { message: 'Disabling the heatmap must remove its painted cells.' }).toBeLessThanOrEqual(10)
  // Prove the canvas measurement excludes DOM colors. No feed or MapLibre
  // scientific source is modified by this test-only decorative overlay.
  await page.locator('.maplibregl-canvas').evaluate(canvas => {
    const overlay = document.createElement('div')
    overlay.id = 'test-only-palette-overlay'
    overlay.className = 'maplibregl-marker'
    overlay.setAttribute('aria-hidden', 'true')
    Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '64px', height: '64px', background: '#440154', zIndex: '10' })
    canvas.parentElement!.append(overlay)
  })
  const ordinaryScreenshot = await page.locator('.maplibregl-canvas').screenshot()
  const scientificScreenshot = await scientificCanvasScreenshot(page)
  const ordinaryCount = await palettePixelCount(page, ordinaryScreenshot)
  const scientificCount = await palettePixelCount(page, scientificScreenshot)
  await testInfo.attach('dom-overlay-canvas-comparison.json', { body: JSON.stringify({ ordinaryCount, scientificCount }), contentType: 'application/json' })
  await testInfo.attach('canvas-with-dom-overlay.png', { body: ordinaryScreenshot, contentType: 'image/png' })
  await testInfo.attach('canvas-with-overlay-excluded.png', { body: scientificScreenshot, contentType: 'image/png' })
  expect(ordinaryCount, 'Ordinary screenshots include test-only marker palette pixels.').toBeGreaterThan(10)
  expect(scientificCount, 'Scientific canvas measurements must exclude those DOM pixels.').toBeLessThanOrEqual(10)
  expect(await heatmapColoredPixels(page), 'The pixel assertion helper must also exclude DOM overlay colors.').toBeLessThanOrEqual(10)
  await page.locator('#test-only-palette-overlay').evaluate(element => element.remove())
  expect(errors).toEqual([])
})

test('WebGL unavailable fallback renders actual geometry and no decorative plume', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return original.call(this, type as '2d', ...args as [])
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.svg-map')).toBeVisible()
  await expect(page.locator('.svg-map')).not.toContainText('Official Sovereign Border')
  await expect(page.locator('.svg-map path[data-kind="band"]')).not.toHaveCount(0)
  await expect(page.locator('.svg-map')).toContainText(snapshot('sources.json').sources[0].id)
  await expect(page.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' })).toBeVisible()
  const notes = page.locator('.map-fallback-canvas .static-map-note')
  await expect(notes).toHaveCount(2)
  const first = (await notes.nth(0).boundingBox())!, second = (await notes.nth(1).boundingBox())!
  const geometry = (await page.locator('.svg-map').boundingBox())!
  expect(first.y + first.height).toBeLessThanOrEqual(second.y + 1)
  expect(second.y + second.height).toBeLessThanOrEqual(geometry.y + 1)
  expect(geometry.height).toBeGreaterThan(100)
  await page.screenshot({ path: testInfo.outputPath('actual-geometry-fallback.png') })
})
