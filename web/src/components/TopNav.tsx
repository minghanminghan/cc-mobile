import sourceCodeIcon from '../assets/source-code.svg'
import settingsIcon from '../assets/settings.svg'

import { useState } from 'react'
import Settings from './Settings'
import type { AppSettings } from '../lib/settings'

export default function TopNav({ onSettingsChange }: { onSettingsChange?: (s: AppSettings) => void }) {
    const [settingsOpen, setSettingsOpen] = useState(false)

    function toggleSettings() {
        setSettingsOpen(prev => !prev)
    }

    return (
        <>
        <Settings isOpen={settingsOpen} toggleOpen={toggleSettings} onSettingsChange={onSettingsChange} />
        <div className="w-full h-12 bg-gray-800 text-white flex items-center justify-between px-4">
            {/* Name */}
            <div className="text-lg flex items-center">
            <b>Mobile Terminal</b>
            <p>&nbsp;by&nbsp;</p>
            <a href="https://andrewminghanjiang.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
                <u>Andrew Jiang</u>
            </a>
            </div>
            
            <div className="flex items-center gap-2">
                {/* Repo */}
                <a className="flex items-center justify-center p-1.5 rounded hover:bg-gray-700 cursor-pointer"
                    href="https://github.com/minghanminghan/mobile-terminal" target="_blank" rel="noopener noreferrer"
                    title="Source Code"
                >
                    <img src={sourceCodeIcon} alt="Source Code" className="w-5 h-5 invert" />
                </a>
                {/* Settings */}
                <button className="flex items-center justify-center p-1.5 rounded hover:bg-gray-700 cursor-pointer" title="Settings" onClick={toggleSettings}>
                    <img src={settingsIcon} alt="Settings" className="w-5 h-5 invert" />
                </button>
            </div>

        </div>
        </>
    )
}