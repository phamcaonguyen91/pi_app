import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { RefreshCcw, Heart } from 'lucide-react'; 

// Khai báo global Pi object để TypeScript không báo lỗi (Pi được load qua script)
declare global {
    interface Window {
        Pi: any;
    }
}

// Cấu hình Pi
const PI_TESTNET_SCOPE = ['payments'];
const PI_DONATION_AMOUNT = 1;
const PI_RECIPIENT_ADDRESS = 'GBML46SIXNWSYMDJNHPA5CJ4LT65EBJF66HZ26VFPQ3R64EKB7EGYC2P'; // Mã ví bạn cung cấp
const PI_MEMO = 'Ủng hộ game Cờ Tướng - Cảm ơn!';

// Tải Pi SDK
// Lưu ý: Trong môi trường Pi Browser, SDK sẽ tự động được cung cấp.
// Tuy nhiên, để đảm bảo tính độc lập khi chạy trong trình duyệt thông thường, 
// ta sẽ giả định Pi SDK được load.
// Trong môi trường Canvas, ta không thể thêm thẻ <script> trực tiếp trong React
// mà không có side-effect, nên ta sẽ giả định Pi đã có sẵn (hoặc sử dụng một cách
// mô phỏng nếu không chạy trong Pi Browser).
// Ở đây, ta sẽ giả định `window.Pi` sẽ được cung cấp.

// Cấu hình bàn cờ ban đầu (9 cột x 10 hàng)
const initialBoard = [
    ['B_R', 'B_H', 'B_E', 'B_A', 'B_K', 'B_A', 'B_E', 'B_H', 'B_R'],
    [null, null, null, null, null, null, null, null, null],
    [null, 'B_C', null, null, null, null, null, 'B_C', null],
    ['B_P', null, 'B_P', null, 'B_P', null, 'B_P', null, 'B_P'],
    [null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null], // Sông (River)
    ['R_P', null, 'R_P', null, 'R_P', null, 'R_P', null, 'R_P'],
    [null, 'R_C', null, null, null, null, null, 'R_C', null],
    [null, null, null, null, null, null, null, null, null],
    ['R_R', 'R_H', 'R_E', 'R_A', 'R_K', 'R_A', 'R_E', 'R_H', 'R_R'],
];

// Ánh xạ quân cờ sang ký hiệu hiển thị và màu sắc
const pieceMap = {
    'R_K': { name: 'Tướng', char: '將', color: 'red' },
    'R_A': { name: 'Sĩ', char: '仕', color: 'red' },
    'R_E': { name: 'Tượng', char: '相', color: 'red' },
    'R_H': { name: 'Mã', char: '傌', color: 'red' },
    'R_R': { name: 'Xe', char: '俥', color: 'red' },
    'R_C': { name: 'Pháo', char: '炮', color: 'red' },
    'R_P': { name: 'Tốt', char: '兵', color: 'red' },

    'B_K': { name: 'Tướng', char: '帥', color: 'black' },
    'B_A': { name: 'Sĩ', char: '士', color: 'black' },
    'B_E': { name: 'Tượng', char: '象', color: 'black' },
    'B_H': { name: 'Mã', char: '馬', color: 'black' },
    'B_R': { name: 'Xe', char: '車', color: 'black' },
    'B_C': { name: 'Pháo', char: '包', color: 'black' },
    'B_P': { name: 'Tốt', char: '卒', color: 'black' },
};

// Cấu hình người chơi
const PLAYER_HUMAN = 'R'; // Quân Đỏ
const PLAYER_AI = 'B'; // Quân Đen

// Hàm trợ giúp để lấy chủ sở hữu quân cờ
const getPieceOwner = (piece) => piece ? piece.split('_')[0] : null;

// Component Piece
const Piece = ({ piece, isSelected }) => {
    if (!piece) return null;

    const pieceInfo = pieceMap[piece];
    const pieceStyle = pieceInfo.color === 'red'
        ? 'text-red-700 bg-yellow-100 border-red-500 shadow-red-300'
        : 'text-black bg-yellow-100 border-black shadow-gray-400';

    return (
        <div
            className={`w-10 h-10 flex items-center justify-center font-bold text-xl rounded-full border-2 transition-transform duration-150 transform ${pieceStyle} ${isSelected ? 'ring-4 ring-yellow-600 scale-110 shadow-2xl' : 'shadow-md'}`}
        >
            {pieceInfo.char}
        </div>
    );
};

// Component App chính
const App = () => {
    const [board, setBoard] = useState(initialBoard);
    const [selectedPosition, setSelectedPosition] = useState(null); // {r: row, c: col}
    const [currentPlayer, setCurrentPlayer] = useState(PLAYER_HUMAN); 
    const [gameStatus, setGameStatus] = useState('Lượt của Đỏ (Người chơi)');
    const [capturedPieces, setCapturedPieces] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [piReady, setPiReady] = useState(false);

    // Khởi tạo Pi SDK (Chỉ chạy một lần)
    useEffect(() => {
        // Tải Pi SDK nếu chưa có (ví dụ: chạy ngoài Pi Browser)
        if (!window.Pi) {
            const script = document.createElement('script');
            script.src = "https://sdk.mine.pi/pi-sdk.js";
            script.onload = () => {
                initializePi();
            };
            document.head.appendChild(script);
        } else {
            initializePi();
        }

        function initializePi() {
            try {
                window.Pi.init({
                    onReady: () => {
                        console.log("Pi SDK đã sẵn sàng.");
                        setPiReady(true);
                    },
                    scopes: PI_TESTNET_SCOPE, // Sử dụng Testnet
                });
            } catch (error) {
                console.error("Lỗi khi khởi tạo Pi SDK:", error);
            }
        }
        
        // Cleanup (nếu cần)
        return () => {
            // Không cần xóa script vì chỉ load 1 lần
        };
    }, []);

    // Custom Modal thay thế cho alert/confirm
    const showMessage = (message) => {
        setModalMessage(message);
        setShowModal(true);
    };

    // Kiểm tra số lượng quân cờ giữa start và end (dùng cho Xe và Pháo)
    const isPathClear = useCallback((start, end, currentBoard) => {
        const dr = Math.sign(end.r - start.r);
        const dc = Math.sign(end.c - start.c);
        let count = 0; // Đếm số lượng quân cờ trên đường đi
        let r = start.r + dr;
        let c = start.c + dc;

        while (r !== end.r || c !== end.c) {
            if (currentBoard[r][c] !== null) {
                count++;
            }
            r += dr;
            c += dc;
        }
        return count; 
    }, []);

    // Logic kiểm tra nước đi hợp lệ (giữ nguyên từ phiên bản trước)
    const isValidMove = useCallback((start, end, currentBoard) => {
        if (end.r < 0 || end.r > 9 || end.c < 0 || end.c > 8) return false;

        const piece = currentBoard[start.r][start.c];
        if (!piece || (start.r === end.r && start.c === end.c)) return false;

        const targetPiece = currentBoard[end.r][end.c];
        const owner = getPieceOwner(piece);
        const isSameOwner = targetPiece && getPieceOwner(targetPiece) === owner;
        if (isSameOwner) return false;

        const dr = end.r - start.r;
        const dc = end.c - start.c;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);
        const isRed = owner === 'R';
        const pieceType = piece.split('_')[1];

        // King (Tướng - K)
        if (pieceType === 'K') {
            const isInsidePalace = (
                (isRed && end.r >= 7 && end.r <= 9 && end.c >= 3 && end.c <= 5) ||
                (!isRed && end.r >= 0 && end.r <= 2 && end.c >= 3 && end.c <= 5)
            );
            const isOneStep = (absDr === 1 && absDc === 0) || (absDc === 1 && absDr === 0);
            return isOneStep && isInsidePalace;
        }

        // Advisor (Sĩ - A)
        if (pieceType === 'A') {
            const isInsidePalace = (
                (isRed && end.r >= 7 && end.r <= 9 && end.c >= 3 && end.c <= 5) ||
                (!isRed && end.r >= 0 && end.r <= 2 && end.c >= 3 && end.c <= 5)
            );
            const isDiagonalOneStep = absDr === 1 && absDc === 1;
            return isDiagonalOneStep && isInsidePalace;
        }

        // Elephant (Tượng - E)
        if (pieceType === 'E') {
            const isCrossingRiver = isRed ? end.r < 5 : end.r > 4;
            if (isCrossingRiver) return false;
            if (absDr !== 2 || absDc !== 2) return false; 

            const blockR = start.r + Math.sign(dr);
            const blockC = start.c + Math.sign(dc);
            if (currentBoard[blockR][blockC] !== null) return false; 

            return true;
        }

        // Horse (Mã - H)
        if (pieceType === 'H') {
            const isLMove = (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
            if (!isLMove) return false;

            let blockR = start.r;
            let blockC = start.c;
            if (absDr > absDc) { blockR += Math.sign(dr); } 
            else { blockC += Math.sign(dc); } 
            
            if (currentBoard[blockR][blockC] !== null) return false; 

            return true;
        }

        // Rook (Xe - R)
        if (pieceType === 'R') {
            const isStraight = (absDr === 0 && absDc > 0) || (absDc === 0 && absDr > 0);
            if (!isStraight) return false;
            
            return isPathClear(start, end, currentBoard) === 0;
        }

        // Cannon (Pháo - C)
        if (pieceType === 'C') {
            const isStraight = (absDr === 0 && absDc > 0) || (absDc === 0 && absDr > 0);
            if (!isStraight) return false;

            const piecesInPath = isPathClear(start, end, currentBoard);

            if (targetPiece) {
                return piecesInPath === 1;
            }
            else {
                return piecesInPath === 0;
            }
        }

        // Pawn (Tốt - P)
        if (pieceType === 'P') {
            const forwardDir = isRed ? -1 : 1; 

            if ((isRed && start.r > 4) || (!isRed && start.r < 5)) {
                return dr === forwardDir && absDc === 0; 
            }
            else {
                const isForward = dr === forwardDir && absDc === 0;
                const isSide = dr === 0 && absDc === 1;
                return isForward || isSide; 
            }
        }

        return false;
    }, [isPathClear]);


    // Thực hiện nước đi và cập nhật trạng thái game (giữ nguyên)
    const makeMove = useCallback((start, end, player, currentBoard) => {
        const pieceToMove = currentBoard[start.r][start.c];
        const captured = currentBoard[end.r][end.c];
        let newBoard = currentBoard.map(row => [...row]);

        newBoard[end.r][end.c] = pieceToMove;
        newBoard[start.r][start.c] = null;

        setBoard(newBoard);
        setSelectedPosition(null);

        if (captured) {
            setCapturedPieces(prev => [...prev, captured]);
        }

        if (captured && captured.endsWith('_K')) {
             setGameStatus(`${player === PLAYER_HUMAN ? 'ĐỎ (Người chơi)' : 'ĐEN (Máy)'} đã thắng!`);
             setCurrentPlayer(null); 
             return;
        }
        
        const nextPlayer = player === PLAYER_HUMAN ? PLAYER_AI : PLAYER_HUMAN;
        setCurrentPlayer(nextPlayer);
        setGameStatus(`Lượt ${nextPlayer === PLAYER_HUMAN ? 'ĐỎ (Người chơi)' : 'ĐEN (Máy)'}`);
        
    }, []);

    // Logic AI đơn giản (Quân Đen) (giữ nguyên)
    const handleAIMove = useCallback(() => {
        if (currentPlayer !== PLAYER_AI) return;
        setIsThinking(true);
        setGameStatus('ĐEN (Máy) đang suy nghĩ...');

        let possibleMoves = [];
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = board[r][c];
                if (piece && getPieceOwner(piece) === PLAYER_AI) {
                    for (let tr = 0; tr < 10; tr++) {
                        for (let tc = 0; tc < 9; tc++) {
                            const start = { r, c };
                            const end = { r: tr, c: tc };
                            if (isValidMove(start, end, board)) { 
                                // Ưu tiên bắt Tướng
                                if (board[tr][tc] === 'R_K') {
                                    setTimeout(() => {
                                        makeMove(start, end, PLAYER_AI, board);
                                        setIsThinking(false);
                                    }, 100);
                                    return;
                                }
                                possibleMoves.push({ start, end, captured: board[tr][tc] });
                            }
                        }
                    }
                }
            }
        }
        
        if (possibleMoves.length > 0) {
            const capturingMoves = possibleMoves.filter(m => m.captured);
            
            let move;
            if (capturingMoves.length > 0) {
                move = capturingMoves[Math.floor(Math.random() * capturingMoves.length)];
            } else {
                move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            }
            
            setTimeout(() => {
                makeMove(move.start, move.end, PLAYER_AI, board);
                setIsThinking(false);
            }, 800);

        } else {
            showMessage('ĐEN bị bí nước. ĐỎ thắng!');
            setGameStatus('ĐỎ thắng!');
            setCurrentPlayer(null);
            setIsThinking(false);
        }
    }, [board, currentPlayer, isValidMove, makeMove]);

    // Lắng nghe lượt của AI (giữ nguyên)
    useEffect(() => {
        if (currentPlayer === PLAYER_AI && !isThinking) {
            handleAIMove();
        }
    }, [currentPlayer, isThinking, handleAIMove]);

    // Xử lý sự kiện click vào ô (giữ nguyên)
    const handleSquareClick = useCallback((r, c) => {
        if (currentPlayer !== PLAYER_HUMAN || isThinking) return;

        const clickedPiece = board[r][c];
        const owner = clickedPiece ? getPieceOwner(clickedPiece) : null;

        // 1. Chưa chọn quân nào
        if (!selectedPosition) {
            if (owner === PLAYER_HUMAN) {
                setSelectedPosition({ r, c });
                setGameStatus(`Đã chọn: ${pieceMap[clickedPiece].name}. Chọn vị trí đến.`);
            } else if (clickedPiece) {
                setGameStatus('Đây là quân của Máy.');
            }
            return;
        }

        const start = selectedPosition;
        const end = { r, c };

        // 2. Hủy chọn hoặc Đổi quân đã chọn
        if (start.r === r && start.c === c || (clickedPiece && owner === PLAYER_HUMAN)) {
            if (start.r === r && start.c === c) {
                setSelectedPosition(null);
                setGameStatus(`Lượt ĐỎ (Người chơi) đi.`);
            } else {
                 setSelectedPosition({ r, c });
                 setGameStatus(`Đã đổi sang: ${pieceMap[clickedPiece].name}. Chọn vị trí đến.`);
            }
            return;
        }

        // 3. Thử di chuyển
        if (isValidMove(start, end, board)) { 
            makeMove(start, end, PLAYER_HUMAN, board);
        } else {
            setGameStatus('Nước đi không hợp lệ. Vui lòng thử lại.');
        }
    }, [board, selectedPosition, currentPlayer, isThinking, isValidMove, makeMove]);


    // Tích hợp Pi Payments
    const initiatePiPayment = async () => {
        if (!piReady || !window.Pi) {
            showMessage("Pi SDK chưa sẵn sàng. Vui lòng thử lại trong Pi Browser.");
            return;
        }

        try {
            // 1. Yêu cầu Pi Browser xác thực người dùng (nếu cần)
            const user = await window.Pi.authenticate(PI_TESTNET_SCOPE, onIncompletePaymentFound);
            
            // 2. Tạo đối tượng thanh toán
            const payment = window.Pi.createPayment({
                amount: PI_DONATION_AMOUNT,
                memo: PI_MEMO,
                metadata: { receiverId: user.uid }, // Thông tin bổ sung
                recipient: PI_RECIPIENT_ADDRESS, // Địa chỉ ví nhận
            }, {
                // 3. Xử lý khi người dùng hủy giao dịch
                onCancel: (paymentId) => {
                    showMessage(`Giao dịch Pi bị hủy bởi người dùng.`);
                },
                // 4. Xử lý khi giao dịch hoàn tất
                onIncomplete: (paymentId) => {
                    // Xử lý khi giao dịch hoàn tất nhưng chưa được xác nhận bởi Server (ít xảy ra)
                    showMessage("Giao dịch đang chờ xác nhận. Vui lòng kiểm tra ví Pi của bạn.");
                },
                // 5. Xử lý khi giao dịch được xác nhận thành công
                onComplete: (paymentId) => {
                    showMessage(`Cảm ơn bạn! Giao dịch ủng hộ ${PI_DONATION_AMOUNT} Pi đã thành công!`);
                },
                // 6. Xử lý lỗi
                onError: (error, payment) => {
                    console.error("Lỗi giao dịch Pi:", error, payment);
                    showMessage(`Lỗi trong quá trình thanh toán Pi: ${error.message || 'Không xác định'}`);
                },
            });

            console.log("Đã gửi yêu cầu thanh toán Pi:", payment);

        } catch (error) {
            console.error("Lỗi khi xác thực Pi hoặc tạo thanh toán:", error);
            showMessage("Lỗi: Không thể khởi tạo thanh toán Pi. Vui lòng đảm bảo bạn đang ở Pi Browser.");
        }
    };

    // Hàm xử lý khi tìm thấy giao dịch Pi chưa hoàn tất (Không cần logic phức tạp cho ứng dụng đơn giản này)
    const onIncompletePaymentFound = (payment) => {
        console.warn("Tìm thấy giao dịch chưa hoàn tất:", payment);
        // Có thể gọi Pi.set = (payment.identifier) để hoàn tất, nhưng ta sẽ bỏ qua ở đây.
    };

    // Render bàn cờ (sử dụng Memoization để tối ưu hiệu suất)
    const renderBoard = useMemo(() => {
        const squares = [];
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = board[r][c];
                const isSelected = selectedPosition && selectedPosition.r === r && selectedPosition.c === c;
                const isPossibleMove = selectedPosition && isValidMove(selectedPosition, { r, c }, board); 

                // Các class border cho đường kẻ ngang dọc
                const borderClasses = `
                    ${r < 9 ? 'border-b border-gray-700' : ''} 
                    ${c < 8 ? 'border-r border-gray-700' : ''}
                `;

                // Vị trí Sông (hàng 4)
                const isRiver = r === 4;

                // Căn giữa quân cờ trong ô
                const pieceWrapperClasses = 'absolute inset-0 flex items-center justify-center pointer-events-none z-20';

                squares.push(
                    <div
                        key={`${r}-${c}`}
                        className={`
                            relative w-full h-full 
                            ${borderClasses} 
                            ${isRiver ? 'border-b-4 border-dashed border-gray-700' : ''}
                            bg-orange-100/70
                            flex items-center justify-center 
                            transition duration-100 ease-in-out
                            ${isPossibleMove ? 'bg-green-300/60 cursor-pointer' : (currentPlayer === PLAYER_HUMAN && piece && getPieceOwner(piece) === PLAYER_HUMAN ? 'cursor-pointer hover:bg-yellow-200/50' : 'cursor-default')}
                            
                        `}
                        onClick={() => handleSquareClick(r, c)}
                    >
                        {/* Hiển thị quân cờ */}
                        <div className={pieceWrapperClasses}>
                            {/* Chỉ báo trực quan cho nước đi có thể */}
                            {isPossibleMove && (
                                <div className={`absolute ${!piece ? 'w-2 h-2 bg-green-700 rounded-full animate-pulse z-30' : 'inset-0 ring-4 ring-green-600/70 rounded-full z-30'}`}></div>
                            )}

                            <Piece piece={piece} isSelected={isSelected} />
                        </div>
                        
                    </div>
                );
            }
        }
        return squares;
    }, [board, selectedPosition, handleSquareClick, isValidMove, isThinking, currentPlayer]);

    // Hàm đặt lại game
    const resetGame = () => {
        setBoard(initialBoard);
        setSelectedPosition(null);
        setCurrentPlayer(PLAYER_HUMAN);
        setGameStatus('Lượt của Đỏ (Người chơi)');
        setCapturedPieces([]);
        setIsThinking(false);
        setShowModal(false);
    };

    // Custom CSS đã được lược bỏ các phần liên quan đến chấm và gạch chéo
    const customStyles = `
        /* Định dạng bàn cờ chung */
        .chess-grid {
            grid-template-columns: repeat(9, 1fr);
            grid-template-rows: repeat(10, 1fr);
            width: min(90vw, 500px); 
            height: min(100vw, 550px);
        }
        
        /* Chữ Sông */
        .river-text {
            font-size: clamp(1rem, 4vw, 1.5rem);
            pointer-events: none;
            color: #4a5568;
        }
        /* Đảm bảo Cung Tướng được kẻ viền đúng */
        .chess-grid > div:nth-child(28), .chess-grid > div:nth-child(36), /* R1C3, R1C5 - Top border for palace */
        .chess-grid > div:nth-child(46), .chess-grid > div:nth-child(54), /* R2C3, R2C5 - Middle border */
        .chess-grid > div:nth-child(79), .chess-grid > div:nth-child(87), /* R7C3, R7C5 - Bottom border */
        .chess-grid > div:nth-child(61), .chess-child(69) /* R8C3, R8C5 - Middle border */
        {}
    `;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:p-8 font-['Inter']">
            {/* Tải Pi SDK */}
            <script src="https://sdk.mine.pi/pi-sdk.js" async></script>
            <style dangerouslySetInnerHTML={{ __html: customStyles }} />

            <h1 className="text-3xl font-extrabold text-indigo-700 mb-6 border-b-4 border-indigo-500 pb-2">
                Game Cờ Tướng (Người vs Máy)
            </h1>

            {/* Khu vực Trạng thái và Điều khiển */}
            <div className="bg-white p-4 rounded-xl shadow-lg w-full max-w-lg mb-6 text-center">
                <p className="text-xl font-semibold mb-2">Trạng thái: <span className="text-green-600">{gameStatus}</span></p>
                <p className="text-lg">
                    Người chơi: <span className="font-bold text-red-600">ĐỎ</span> | 
                    Máy tính: <span className="font-bold text-gray-800">ĐEN</span> 
                    {isThinking && <span className="ml-2 text-yellow-600 animate-pulse">(Đang tính...)</span>}
                </p>
                
                <div className="flex justify-center gap-4 mt-3">
                    <button
                        onClick={resetGame}
                        className="flex items-center px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-150 transform hover:scale-[1.02] disabled:bg-indigo-300"
                        disabled={isThinking}
                    >
                        <RefreshCcw size={18} className="mr-2"/> Chơi Lại
                    </button>
                    {/* Nút Ủng hộ Pi */}
                    <button
                        onClick={initiatePiPayment}
                        className={`flex items-center px-4 py-2 text-black font-semibold rounded-lg shadow-md transition duration-150 transform hover:scale-[1.02] ${piReady ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-400 cursor-not-allowed'}`}
                        disabled={!piReady}
                    >
                        <Heart size={18} className="mr-2 text-red-600"/> 
                        {piReady ? `Ủng hộ ${PI_DONATION_AMOUNT} Pi` : 'Đang tải Pi SDK...'}
                    </button>
                </div>
            </div>

            {/* Bàn cờ */}
            <div className="relative border-4 border-gray-800 bg-orange-100/70 rounded-lg shadow-2xl">
                <div className="grid chess-grid relative">
                    {renderBoard}
                </div>
                {/* Chữ Sông */}
                <div className="absolute w-full h-[10%] top-[45%] flex items-center justify-center pointer-events-none">
                    <span className="river-text font-serif font-bold">SÔNG HÁN - SỞ HÀN GIỚI</span>
                </div>
            </div>

            {/* Quân cờ đã bị bắt */}
            <div className="mt-8 p-4 bg-gray-200 rounded-xl shadow-inner w-full max-w-lg">
                <h2 className="text-lg font-semibold mb-2 text-gray-700">Quân đã bị bắt:</h2>
                <div className="flex flex-wrap gap-2 min-h-[40px] justify-center">
                    {capturedPieces.length > 0 ? (
                        capturedPieces.map((piece, index) => (
                            <Piece key={index} piece={piece} isSelected={false} />
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">Chưa có quân nào bị bắt.</p>
                    )}
                </div>
            </div>
            
            {/* Custom Modal cho thông báo */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center">
                        <p className="text-lg font-medium mb-4">{modalMessage}</p>
                        <button 
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Đặt App làm export mặc định để môi trường tự động render component.
export default App;