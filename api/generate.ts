import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chromium } from 'playwright'

import ejs from 'ejs'

import { z } from 'zod'

import ms from 'ms'

import { SpaceService } from 'm3o/space'

import { nanoid } from 'nanoid'

const space = new SpaceService(process.env.M3O_API_KEY!)

const inputSchema = z.object({
  name: z.string().optional(),
  template: z.string(),
  parser: z.enum(['ejs' /*, 'handlebars', 'liquid' */]).default('ejs'),
  params: z
    .record(z.union([z.string(), z.number(), z.date(), z.boolean(), z.any()]))
    .optional()
})

const handler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method?.toUpperCase() !== 'POST') {
    res.status(404).send({
      status: 'error',
      error: 404
    })
    return
  }

  try {
    const payload = inputSchema.parse(req.body)
    console.log('payload', payload)

    const template = ejs.compile(payload.template, { async: true })
    const html = await template(payload.params)

    const browser = await chromium.launch({
      headless: true,
      args: ['--font-render-hinting=none']
    })

    const page = await browser.newPage()

    await page.setContent(html, {
      timeout: ms('1m'),
      waitUntil: 'networkidle'
    })

    await page.setViewportSize({
      width: 1920,
      height: 1080
    })

    const pdfBuffer = await page.pdf({
      format: 'a4',
      margin: { bottom: 0, left: 0, right: 0, top: 0 },
      printBackground: true,
      pageRanges: '1'
    })

    await browser.close()

    const response = await space.create({
      name: nanoid() + '.pdf',
      object: pdfBuffer.toString('base64'),
      visibility: 'public'
    })

    res.status(200).send(response.url)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).send({
        status: 'error',
        error: 400,
        messages: error.issues
      })
      return
    } else {
      console.log(error)
    }
  }
}

export default handler
